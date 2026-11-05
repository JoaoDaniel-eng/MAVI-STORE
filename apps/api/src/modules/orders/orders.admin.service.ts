import crypto from "node:crypto";
import type { OrderAction, OrderListQuery, Role } from "@mavi/shared";
import { pool, withTransaction } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";
import { addOrderEvent, pickupCodeFor, queueOrderEmail } from "../checkout/orders.service";
import { camel, type Row } from "../catalog/crud";
import { releaseReservations } from "../stock/reservations.service";
import { insertMovement, lockLevel } from "../stock/stock.service";

type Actor = { id: string; role: Role };
const bad = (msg: string) => new AppError(409, "invalid_transition", msg);

export async function listOrders(q: OrderListQuery) {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (q.status) add("o.status = ?", q.status);
  if (q.paymentStatus) add("o.payment_status = ?", q.paymentStatus);
  if (q.fulfillment) add("o.fulfillment = ?", q.fulfillment);
  if (q.location) add("l.code = ?", q.location);
  if (q.requiresRefund !== undefined) add("o.requires_refund = ?", q.requiresRefund);
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    params.push(like);
    const n = params.length;
    const num = /^\d{1,12}$/.test(q.q) ? (params.push(Number(q.q)), ` OR o.order_number = $${params.length}`) : "";
    where.push(`(o.customer_name ILIKE $${n} OR o.customer_email::text ILIKE $${n}${num})`);
  }
  params.push(q.limit, q.offset);
  const { rows } = await pool.query<Row>(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method, o.fulfillment, o.total_cents,
            o.requires_refund, o.customer_name, o.customer_email, o.created_at, l.code AS origin_code,
            count(*) OVER() AS total
       FROM orders o JOIN locations l ON l.id = o.origin_location_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? Number(rows[0]["total"]) : 0,
    items: rows.map((r) => { const { total: _t, ...rest } = camel(r); return { ...rest, orderNumber: Number(rest["orderNumber"]) }; }),
  };
}

export async function getAdminOrder(id: string) {
  const o = (await pool.query<Row>(
    `SELECT o.*, l.code AS origin_code, l.name AS origin_name, pl.name AS pickup_name
       FROM orders o JOIN locations l ON l.id = o.origin_location_id LEFT JOIN locations pl ON pl.id = o.pickup_location_id
      WHERE o.id = $1`, [id],
  )).rows[0];
  if (!o) throw new AppError(404, "not_found", "Pedido não encontrado.");
  const [items, payments, events] = await Promise.all([
    pool.query<Row>(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_name, size_label`, [id]),
    pool.query<Row>(`SELECT id, gateway, method, status, amount_cents, gateway_payment_id, paid_at, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query<Row>(`SELECT e.id, e.status, e.note, e.created_at, u.name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.order_id = $1 ORDER BY e.id`, [id]),
  ]);
  const { checkout_ref: _c, idempotency_key: _i, ...order } = o;
  return {
    ...camel(order),
    orderNumber: Number(o["order_number"]),
    items: items.rows.map(camel),
    payments: payments.rows.map(camel),
    events: events.rows.map((e) => ({ ...camel(e), id: String(e["id"]) })),
  };
}

const sameCode = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function applyAction(id: string, input: OrderAction, actor: Actor, ctx: AuditCtx) {
  return withTransaction(async (c) => {
    const o = (await c.query<Row>(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!o) throw new AppError(404, "not_found", "Pedido não encontrado.");
    const status = o["status"] as string;
    const fulfillment = o["fulfillment"] as string;
    const number = Number(o["order_number"]);
    let next = status;
    let note: string | null = "note" in input ? input.note ?? null : null;

    switch (input.action) {
      case "process":
        if (status !== "confirmed") throw bad("Só pedidos confirmados podem ir para separação.");
        next = "processing";
        await c.query(`UPDATE orders SET status = 'processing' WHERE id = $1`, [id]);
        break;

      case "ship":
        if (fulfillment !== "ship" || status !== "processing") throw bad("Só pedidos de entrega em separação podem ser enviados.");
        next = "shipped";
        await c.query(`UPDATE orders SET status = 'shipped', tracking_code = $2 WHERE id = $1`, [id, input.trackingCode ?? null]);
        await queueOrderEmail(c, o, "order_shipped", { tracking: input.trackingCode ?? null });
        note = [input.trackingCode ? `Rastreio: ${input.trackingCode}` : null, note].filter(Boolean).join(" · ") || null;
        break;

      case "ready":
        if (fulfillment !== "pickup" || status !== "processing") throw bad("Só pedidos de retirada em separação ficam prontos para retirada.");
        next = "ready_for_pickup";
        await c.query(`UPDATE orders SET status = 'ready_for_pickup' WHERE id = $1`, [id]);
        await queueOrderEmail(c, o, "order_ready_for_pickup", { code: pickupCodeFor(id) });
        break;

      case "deliver": {
        if (fulfillment === "ship") {
          if (status !== "shipped") throw bad("Só pedidos enviados podem ser marcados como entregues.");
        } else {
          if (status !== "ready_for_pickup") throw bad("Só pedidos prontos para retirada podem ser entregues.");
          if (!input.pickupCode || !sameCode(input.pickupCode, pickupCodeFor(id))) {
            throw new AppError(422, "invalid_pickup_code", "Código de retirada inválido.");
          }
        }
        if (o["payment_method"] === "pay_on_pickup" && o["payment_status"] !== "paid") {
          if (!input.paymentReceived) throw new AppError(422, "payment_required", "Confirme o recebimento do pagamento na retirada.");
          await c.query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [id]);
          note = ["Pagamento recebido na retirada", note].filter(Boolean).join(" · ");
        }
        next = "delivered";
        await c.query(`UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = $1`, [id]);
        break;
      }

      case "cancel": {
        if (!["awaiting_payment", "confirmed", "processing", "ready_for_pickup"].includes(status)) {
          throw bad("Este pedido não pode mais ser cancelado por aqui.");
        }
        if (status === "awaiting_payment") {
          await releaseReservations(c, o["checkout_ref"] as string);
          await c.query(`UPDATE payments SET status = 'cancelled' WHERE order_id = $1 AND status = 'pending'`, [id]);
        } else {
          // A venda já tinha baixado o estoque: devolve à unidade que separava o pedido.
          const items = (await c.query<{ sku_id: string; quantity: number }>(`SELECT sku_id, quantity FROM order_items WHERE order_id = $1 ORDER BY sku_id`, [id])).rows;
          for (const it of items) {
            const lvl = await lockLevel(c, it.sku_id, o["origin_location_id"] as string);
            const after = lvl.on_hand + it.quantity;
            await c.query(`UPDATE stock_levels SET on_hand = $3 WHERE sku_id = $1 AND location_id = $2`, [it.sku_id, o["origin_location_id"], after]);
            await insertMovement(c, {
              skuId: it.sku_id, locationId: o["origin_location_id"] as string, type: "entry", delta: it.quantity, after,
              reason: `Cancelamento do pedido nº ${number}`, actorId: actor.id, refType: "order_cancel", refId: id,
            });
          }
        }
        if (o["coupon_id"]) {
          await c.query(`UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1`, [o["coupon_id"]]);
          await c.query(`DELETE FROM coupon_redemptions WHERE order_id = $1`, [id]);
        }
        const refund = o["payment_status"] === "paid";
        next = "cancelled";
        await c.query(
          `UPDATE orders SET status = 'cancelled', cancel_reason = $2, cancelled_at = now(), requires_refund = (requires_refund OR $3) WHERE id = $1`,
          [id, input.reason, refund],
        );
        await queueOrderEmail(c, o, "order_cancelled", { reason: input.reason, refund });
        note = input.reason;
        break;
      }

      case "refund_done":
        if (!o["requires_refund"]) throw bad("Este pedido não tem reembolso pendente.");
        await c.query(`UPDATE orders SET requires_refund = false, payment_status = 'refunded' WHERE id = $1`, [id]);
        await c.query(`UPDATE payments SET status = 'refunded' WHERE order_id = $1 AND status = 'paid'`, [id]);
        note = ["Reembolso realizado", note].filter(Boolean).join(" · ");
        break;
    }

    await addOrderEvent(c, id, input.action === "refund_done" ? status : next, note, actor.id);
    await writeAudit(c, ctx, { action: `order.${input.action}`, entity: "order", entityId: id, before: { status }, after: { status: next, note } });
    return { id, status: next };
  });
}
