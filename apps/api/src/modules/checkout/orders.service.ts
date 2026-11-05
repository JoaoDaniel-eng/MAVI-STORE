import crypto from "node:crypto";
import { PAYMENT_METHODS, type CheckoutInput, type OrderSummary, type OrderView, type PaymentMethod } from "@mavi/shared";
import type { PoolClient } from "pg";
import { env } from "../../config/env";
import { pool, withTransaction, type Queryable } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { enqueueEmail } from "../email/outbox";
import { siteLink, type Template } from "../email/templates";
import { evaluateCoupon } from "../coupons/coupons.service";
import { getSetting } from "../settings/settings.service";
import { activeGateway } from "../payments/index";
import { commitReservations, expireDue, reserveItems } from "../stock/reservations.service";
import { priceItems, subtotalOf } from "./pricing.service";
import { quoteShipping } from "./shipping.service";

type R = Record<string, unknown>;

/** Token de acesso do pedido (convidado). Derivado do id: não precisa ser guardado e é estável em reenvios. */
export const orderToken = (orderId: string) =>
  crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`order:${orderId}`).digest("base64url");

/** Código de retirada de 6 dígitos, derivado do pedido: a cliente vê; a loja só confere. */
export function pickupCodeFor(orderId: string): string {
  const h = crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`pickup:${orderId}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export async function addOrderEvent(db: Queryable, orderId: string, status: string, note?: string | null, actorId?: string | null) {
  await db.query(`INSERT INTO order_events (order_id, status, note, actor_id) VALUES ($1,$2,$3,$4)`, [orderId, status, note ?? null, actorId ?? null]);
}

export async function queueOrderEmail(db: Queryable, o: R, template: Template, extra: Record<string, unknown> = {}) {
  let pickup: string | null = null;
  if (o["pickup_location_id"]) {
    pickup = (await db.query<{ name: string }>(`SELECT name FROM locations WHERE id = $1`, [o["pickup_location_id"]])).rows[0]?.name ?? null;
  }
  const id = o["id"] as string;
  await enqueueEmail(db, o["customer_email"] as string, template, {
    name: o["customer_name"], number: Number(o["order_number"]), totalCents: o["total_cents"], pickup, location: pickup,
    link: siteLink(`/pedido/${id}?t=${orderToken(id)}`), ...extra,
  });
}

export function tokenMatches(orderId: string, token: string | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(orderToken(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function enabledPaymentMethods(): Promise<PaymentMethod[]> {
  const v = await getSetting(pool, "payments.enabled_methods");
  const online = activeGateway() !== null; // Pix e cartão só existem com gateway configurado
  return v.filter((m) => (PAYMENT_METHODS as readonly string[]).includes(m) && (m === "pay_on_pickup" || online));
}

const summaryOf = (o: R): OrderSummary => ({
  id: o["id"] as string, number: Number(o["order_number"]), status: o["status"] as string,
  paymentStatus: o["payment_status"] as string, paymentMethod: o["payment_method"] as PaymentMethod,
  totalCents: o["total_cents"] as number, expiresAt: (o["expires_at"] as Date).toISOString(),
  accessToken: orderToken(o["id"] as string),
});

export async function createOrder(
  input: CheckoutInput,
  idempotencyKey: string,
  userId: string | undefined,
): Promise<{ order: OrderSummary; replay: boolean }> {
  // 0) Reenvio com a mesma chave devolve o pedido já criado.
  const prev = (await pool.query<R>(`SELECT * FROM orders WHERE idempotency_key = $1`, [idempotencyKey])).rows[0];
  if (prev) {
    if ((prev["customer_email"] as string).toLowerCase() !== input.customer.email) {
      throw new AppError(409, "idempotency_conflict", "Chave de idempotência já usada em outro pedido.");
    }
    return { order: summaryOf(prev), replay: true };
  }

  // 1) Só aceita formas de pagamento ativadas (nenhuma até a Fase 7).
  const enabled = await enabledPaymentMethods();
  if (!enabled.includes(input.paymentMethod)) {
    throw new AppError(409, "payment_unavailable", "Forma de pagamento indisponível no momento.");
  }

  // 2) Preços e disponibilidade do banco.
  const lines = await priceItems(pool, input.items);
  const bad = lines.filter((l) => l.problem);
  if (bad.length) throw new AppError(409, "cart_changed", "Alguns itens mudaram de preço ou disponibilidade.", { skuIds: bad.map((l) => l.skuId) });
  const subtotal = subtotalOf(lines);

  // 3) Entrega (a chamada externa fica fora da transação).
  const f = input.fulfillment;
  let originId: string;
  let pickupLocationId: string | null = null;
  let shippingCents = 0;
  let shippingService: { serviceId: number; name: string; company: string; deliveryDays: number } | null = null;

  if (f.type === "ship") {
    const q = await quoteShipping(input.items, f.address.postalCode);
    const opt = q.shipping.options.find((o) => o.serviceId === f.serviceId);
    if (!q.shipping.available || !opt || !q.origin) {
      throw new AppError(409, "shipping_unavailable", "Opção de entrega indisponível. Calcule o frete novamente.");
    }
    originId = q.origin.id;
    shippingCents = opt.priceCents;
    shippingService = { serviceId: opt.serviceId, name: opt.name, company: opt.company, deliveryDays: opt.deliveryDays };
  } else {
    const loc = (await pool.query<R>(`SELECT id, pickup_fee_cents FROM locations WHERE code = $1 AND is_active AND pickup_enabled`, [f.locationCode])).rows[0];
    if (!loc) throw new AppError(400, "invalid_location", "Unidade de retirada inválida.");
    originId = pickupLocationId = loc["id"] as string;
    shippingCents = loc["pickup_fee_cents"] as number;
  }

  // 4) Transação: cupom, reserva de estoque e pedido.
  const checkoutRef = crypto.randomUUID();
  try {
    const order = await withTransaction(async (c) => {
      let discount = 0;
      let shippingDiscount = 0;
      let couponId: string | null = null;
      let couponCode: string | null = null;
      if (input.couponCode) {
        const r = await evaluateCoupon(c, input.couponCode, { subtotalCents: subtotal, shippingCents, email: input.customer.email, userId }, true);
        const used = await c.query(`UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit)`, [r.coupon.id]);
        if (!used.rowCount) throw new AppError(422, "coupon_exhausted", "Este cupom já atingiu o limite de usos.");
        discount = r.discountCents;
        shippingDiscount = r.shippingDiscountCents;
        couponId = r.coupon.id;
        couponCode = r.coupon.code;
      }
      const total = subtotal - discount + shippingCents - shippingDiscount;

      const { expiresAt } = await reserveItems(c, { checkoutRef, locationId: originId, items: input.items });

      const { rows } = await c.query<R>(
        `INSERT INTO orders (user_id, customer_email, customer_name, customer_phone, customer_document, fulfillment,
            pickup_location_id, origin_location_id, shipping_address, shipping_service, subtotal_cents, discount_cents,
            shipping_cents, shipping_discount_cents, total_cents, coupon_id, coupon_code, payment_method,
            checkout_ref, idempotency_key, notes, expires_at, terms_accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, now()) RETURNING *`,
        [
          userId ?? null, input.customer.email, input.customer.name, input.customer.phone, input.customer.document, f.type,
          pickupLocationId, originId, f.type === "ship" ? JSON.stringify(f.address) : null,
          shippingService ? JSON.stringify(shippingService) : null, subtotal, discount, shippingCents, shippingDiscount,
          total, couponId, couponCode, input.paymentMethod, checkoutRef, idempotencyKey, input.notes ?? null, expiresAt,
        ],
      );
      const o = rows[0]!;
      for (const l of lines) {
        await c.query(
          `INSERT INTO order_items (order_id, sku_id, product_name, sku_code, color_name, size_label, image_url, unit_price_cents, quantity, total_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [o["id"], l.skuId, l.productName, l.skuCode, l.colorName, l.sizeLabel, l.imageUrl, l.unitPriceCents, l.quantity, l.lineTotalCents],
        );
      }
      if (couponId) {
        await c.query(`INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, customer_email) VALUES ($1,$2,$3,$4)`, [couponId, o["id"], userId ?? null, input.customer.email]);
      }
      if (input.paymentMethod === "pay_on_pickup") {
        // Pagamento na retirada: o pedido já nasce confirmado e a reserva vira baixa de estoque.
        await commitReservations(c, checkoutRef, { type: "order", id: o["id"] as string });
        const u = await c.query<R>(`UPDATE orders SET status = 'confirmed' WHERE id = $1 RETURNING *`, [o["id"]]);
        await addOrderEvent(c, o["id"] as string, "confirmed", "Pedido confirmado. Pagamento na retirada.");
        await queueOrderEmail(c, u.rows[0]!, "order_confirmed");
        return summaryOf(u.rows[0]!);
      }
      await addOrderEvent(c, o["id"] as string, "awaiting_payment", "Pedido criado.");
      return summaryOf(o);
    });
    return { order, replay: false };
  } catch (e) {
    // Corrida entre dois envios da mesma chave: devolve o pedido que ganhou.
    if ((e as { code?: string }).code === "23505") {
      const again = (await pool.query<R>(`SELECT * FROM orders WHERE idempotency_key = $1`, [idempotencyKey])).rows[0];
      if (again) return { order: summaryOf(again), replay: true };
    }
    throw e;
  }
}

export async function getOrder(id: string, auth: { token?: string | undefined; userId?: string | undefined }): Promise<OrderView> {
  const o = (await pool.query<R>(
    `SELECT o.*, pl.name AS pickup_name FROM orders o LEFT JOIN locations pl ON pl.id = o.pickup_location_id WHERE o.id = $1`,
    [id],
  )).rows[0];
  const allowed = o && (tokenMatches(id, auth.token) || (auth.userId && o["user_id"] === auth.userId));
  if (!o || !allowed) throw new AppError(404, "not_found", "Pedido não encontrado.");
  const items = (await pool.query<R>(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_name, size_label`, [id])).rows;
  const events = (await pool.query<R>(`SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY id`, [id])).rows;
  const { accessToken: _t, ...sum } = summaryOf(o);
  const svc = o["shipping_service"] as { name: string; company: string; deliveryDays: number } | null;
  return {
    ...sum,
    fulfillment: o["fulfillment"] as "ship" | "pickup",
    pickupLocation: (o["pickup_name"] as string | null) ?? null,
    address: (o["shipping_address"] as Record<string, string> | null) ?? null,
    shippingService: svc ? { name: svc.name, company: svc.company, deliveryDays: svc.deliveryDays } : null,
    items: items.map((i) => ({
      productName: i["product_name"] as string, skuCode: i["sku_code"] as string, colorName: i["color_name"] as string,
      sizeLabel: i["size_label"] as string, imageUrl: (i["image_url"] as string | null) ?? null,
      unitPriceCents: i["unit_price_cents"] as number, quantity: i["quantity"] as number, totalCents: i["total_cents"] as number,
    })),
    subtotalCents: o["subtotal_cents"] as number, discountCents: o["discount_cents"] as number,
    shippingCents: o["shipping_cents"] as number, shippingDiscountCents: o["shipping_discount_cents"] as number,
    couponCode: (o["coupon_code"] as string | null) ?? null, createdAt: (o["created_at"] as Date).toISOString(),
    trackingCode: (o["tracking_code"] as string | null) ?? null,
    pickupCode: o["status"] === "ready_for_pickup" ? pickupCodeFor(id) : null,
    timeline: events.map((e) => ({ status: e["status"] as string, note: (e["note"] as string | null) ?? null, createdAt: (e["created_at"] as Date).toISOString() })),
  };
}

/** Cancela pedidos sem pagamento depois do prazo e devolve o uso do cupom. A reserva já expirou sozinha. */
export async function cancelExpiredOrders(c: PoolClient): Promise<number> {
  await expireDue(c);
  const { rows } = await c.query<{ id: string; coupon_id: string | null }>(
    `UPDATE orders SET status = 'cancelled'
      WHERE status = 'awaiting_payment' AND payment_status = 'pending' AND expires_at <= now()
      RETURNING id, coupon_id`,
  );
  for (const r of rows) {
    if (r.coupon_id) {
      await c.query(`UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1`, [r.coupon_id]);
      await c.query(`DELETE FROM coupon_redemptions WHERE order_id = $1`, [r.id]);
    }
  }
  return rows.length;
}
