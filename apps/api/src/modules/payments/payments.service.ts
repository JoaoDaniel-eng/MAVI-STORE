import type { PaymentView } from "@mavi/shared";
import { env } from "../../config/env";
import { pool, withTransaction } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { writeAudit } from "../audit/audit.service";
import { addOrderEvent, orderToken, queueOrderEmail, tokenMatches } from "../checkout/orders.service";
import { commitReservations } from "../stock/reservations.service";
import { activeGateway } from "./index";
import { GatewayError, type GatewayId, type GwPayment } from "./types";

type R = Record<string, unknown>;
const SYSTEM = { actorId: null, actorRole: null } as const;

const toView = (p: R): PaymentView => {
  const payload = (p["payload"] ?? {}) as { copyPaste?: string; qrImageBase64?: string | null; redirectUrl?: string };
  return {
    method: p["method"] as PaymentView["method"],
    status: p["status"] as PaymentView["status"],
    ...(payload.copyPaste && { pix: { copyPaste: payload.copyPaste, qrImageBase64: payload.qrImageBase64 ?? null } }),
    ...(payload.redirectUrl && { redirectUrl: payload.redirectUrl }),
  };
};

async function authorizedOrder(id: string, auth: { token?: string | undefined; userId?: string | undefined }): Promise<R> {
  const o = (await pool.query<R>(`SELECT * FROM orders WHERE id = $1`, [id])).rows[0];
  if (!o || !(tokenMatches(id, auth.token) || (auth.userId && o["user_id"] === auth.userId))) {
    throw new AppError(404, "not_found", "Pedido não encontrado.");
  }
  return o;
}

export async function getPaymentView(orderId: string, auth: { token?: string | undefined; userId?: string | undefined }) {
  await authorizedOrder(orderId, auth);
  const p = (await pool.query<R>(`SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId])).rows[0];
  return p ? toView(p) : null;
}

/** Gera (ou devolve) a cobrança aberta do pedido. Só existe uma cobrança pendente por pedido. */
export async function createOrGetPayment(orderId: string, auth: { token?: string | undefined; userId?: string | undefined }): Promise<PaymentView> {
  const o = await authorizedOrder(orderId, auth);
  if (o["status"] !== "awaiting_payment") throw new AppError(409, "order_not_payable", "Este pedido não está aguardando pagamento.");
  if ((o["expires_at"] as Date) <= new Date()) throw new AppError(409, "order_expired", "O prazo para pagar este pedido terminou.");
  const method = o["payment_method"] as string;
  if (method !== "pix" && method !== "card") throw new AppError(409, "order_not_payable", "Este pedido não usa pagamento online.");

  const open = (await pool.query<R>(`SELECT * FROM payments WHERE order_id = $1 AND status = 'pending'`, [orderId])).rows[0];
  if (open) {
    if (open["payload"]) return toView(open);
    throw new AppError(409, "payment_in_progress", "Pagamento em preparação. Tente novamente em instantes.");
  }

  const gw = activeGateway();
  if (!gw) throw new AppError(503, "payments_pending", "Pagamento online pendente de configuração.");
  if (method === "card" && !env.SITE_URL) throw new AppError(503, "site_url_pending", "SITE_URL pendente: necessário para o retorno do pagamento.");

  let rowId: string;
  try {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO payments (order_id, gateway, method, amount_cents) VALUES ($1,$2,$3,$4) RETURNING id`,
      [orderId, gw.id, method, o["total_cents"]],
    );
    rowId = ins.rows[0]!.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new AppError(409, "payment_in_progress", "Pagamento em preparação. Tente novamente em instantes.");
    throw e;
  }

  const gwOrder = {
    id: orderId, number: Number(o["order_number"]), totalCents: o["total_cents"] as number,
    customer: { name: o["customer_name"] as string, email: o["customer_email"] as string, phone: o["customer_phone"] as string, document: o["customer_document"] as string },
    returnUrl: env.SITE_URL ? `${env.SITE_URL.replace(/\/$/, "")}/pedido/${orderId}?t=${orderToken(orderId)}` : "",
  };
  const idem = `mavi-pay-${rowId}`;

  try {
    if (method === "pix") {
      const c = await gw.createPix(gwOrder, idem);
      const upd = await pool.query<R>(
        `UPDATE payments SET gateway_payment_id = $2, payload = $3 WHERE id = $1 RETURNING *`,
        [rowId, c.gatewayPaymentId, JSON.stringify({ copyPaste: c.copyPaste, qrImageBase64: c.qrImageBase64 })],
      );
      return toView(upd.rows[0]!);
    }
    const c = await gw.createCardCheckout(gwOrder, idem);
    const upd = await pool.query<R>(
      `UPDATE payments SET gateway_payment_id = $2, gateway_reference = $3, payload = $4 WHERE id = $1 RETURNING *`,
      [rowId, c.gatewayPaymentId, c.gatewayReference, JSON.stringify({ redirectUrl: c.redirectUrl })],
    );
    return toView(upd.rows[0]!);
  } catch (e) {
    await pool.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [rowId]); // libera nova tentativa
    if (e instanceof GatewayError) console.error("Falha no gateway:", e.message);
    else console.error(e);
    throw new AppError(502, "gateway_error", "Não foi possível gerar o pagamento. Tente novamente.");
  }
}

/**
 * Núcleo da confirmação. Recebe o pagamento JÁ consultado no gateway (nunca o corpo da notificação).
 * Cada (pagamento, status) é processado uma vez; tudo acontece numa transação.
 */
export async function processGatewayPayment(gateway: GatewayId, info: GwPayment): Promise<string> {
  return withTransaction(async (c) => {
    const ev = await c.query<{ id: string }>(
      `INSERT INTO payment_events (gateway, event_key, payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
      [gateway, `${info.gatewayPaymentId}:${info.status}`, JSON.stringify(info)],
    );
    if (!ev.rowCount) return "duplicate";
    const finish = async (outcome: string) => {
      await c.query(`UPDATE payment_events SET outcome = $2 WHERE id = $1`, [ev.rows[0]!.id, outcome]);
      return outcome;
    };

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!info.orderId || !uuid.test(info.orderId)) return finish("no_order");
    const order = (await c.query<R>(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [info.orderId])).rows[0];
    if (!order) return finish("order_not_found");

    let pay = (await c.query<R>(
      `SELECT * FROM payments WHERE order_id = $1 AND gateway = $2 AND (gateway_payment_id = $3 OR gateway_payment_id IS NULL)
        ORDER BY (gateway_payment_id IS NOT NULL) DESC, created_at DESC LIMIT 1 FOR UPDATE`,
      [info.orderId, gateway, info.gatewayPaymentId],
    )).rows[0];

    if (!pay) {
      if (info.status === "pending") return finish("ignored_unknown_pending");
      const method = order["payment_method"] === "card" ? "card" : "pix";
      pay = (await c.query<R>(
        `INSERT INTO payments (order_id, gateway, method, status, amount_cents, gateway_payment_id)
         VALUES ($1,$2,$3,'failed',$4,$5) RETURNING *`,
        [info.orderId, gateway, method, info.amountCents, info.gatewayPaymentId],
      )).rows[0]!;
    }
    const payId = pay["id"] as string;
    await c.query(`UPDATE payments SET gateway_payment_id = $2 WHERE id = $1 AND gateway_payment_id IS NULL`, [payId, info.gatewayPaymentId]);

    // Evento atrasado não rebaixa um pagamento já confirmado.
    if (pay["status"] === "paid" && info.status !== "refunded") return finish("stale");

    if (info.status === "paid") {
      if (info.amountCents !== (order["total_cents"] as number)) {
        await writeAudit(c, SYSTEM, { action: "payment.amount_mismatch", entity: "order", entityId: info.orderId, after: { gateway, paymentId: info.gatewayPaymentId, paid: info.amountCents, expected: order["total_cents"] } });
        return finish("amount_mismatch");
      }
      if (order["payment_status"] === "paid") {
        await c.query(`UPDATE payments SET status = 'paid', paid_at = COALESCE(paid_at, now()) WHERE id = $1`, [payId]);
        return finish("already_paid");
      }
      await c.query(`UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1`, [payId]);

      let outcome = "paid";
      if (order["status"] === "cancelled" && order["cancel_reason"]) {
        // Pedido cancelado pela loja: não reabre; o valor recebido precisa ser devolvido.
        await c.query(`UPDATE orders SET payment_status = 'paid', requires_refund = true WHERE id = $1`, [info.orderId]);
        outcome = "paid_after_cancel";
      } else {
        await c.query("SAVEPOINT commit_stock");
        try {
          await commitReservations(c, order["checkout_ref"] as string, { type: "order", id: info.orderId });
          await c.query("RELEASE SAVEPOINT commit_stock");
          await c.query(`UPDATE orders SET status = 'confirmed', payment_status = 'paid', requires_refund = false WHERE id = $1`, [info.orderId]);
        } catch (e) {
          await c.query("ROLLBACK TO SAVEPOINT commit_stock");
          if (!(e instanceof AppError) || !["stock_unavailable", "reservation_not_found"].includes(e.code)) throw e;
          // Pagou depois de perder a reserva e já não há estoque: precisa de reembolso manual.
          await c.query(`UPDATE orders SET status = 'cancelled', payment_status = 'paid', requires_refund = true WHERE id = $1`, [info.orderId]);
          outcome = "paid_without_stock";
        }
      }
      const fresh = (await c.query<R>(`SELECT * FROM orders WHERE id = $1`, [info.orderId])).rows[0]!;
      if (outcome === "paid") {
        await addOrderEvent(c, info.orderId, "confirmed", "Pagamento confirmado.");
        await queueOrderEmail(c, fresh, "order_confirmed");
      } else {
        await addOrderEvent(c, info.orderId, "cancelled", "Pagamento recebido, mas o pedido não pôde ser atendido. Reembolso necessário.");
        await queueOrderEmail(c, fresh, "order_cancelled", { reason: "Item indisponível após o pagamento.", refund: true });
      }
      await writeAudit(c, SYSTEM, { action: `payment.${outcome}`, entity: "order", entityId: info.orderId, after: { gateway, paymentId: info.gatewayPaymentId, amountCents: info.amountCents } });
      return finish(outcome);
    }

    if (info.status === "refunded") {
      await c.query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [payId]);
      await c.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [info.orderId]);
      await writeAudit(c, SYSTEM, { action: "payment.refunded", entity: "order", entityId: info.orderId, after: { gateway, paymentId: info.gatewayPaymentId } });
      return finish("refunded");
    }

    // pending / failed / cancelled: só atualiza a cobrança; o pedido segue aguardando até expirar.
    await c.query(`UPDATE payments SET status = $2 WHERE id = $1`, [payId, info.status]);
    return finish(info.status);
  });
}

export async function listPayments(limit: number, offset: number) {
  const { rows } = await pool.query<R>(
    `SELECT p.id, p.gateway, p.method, p.status, p.amount_cents, p.gateway_payment_id, p.paid_at, p.created_at,
            o.id AS order_id, o.order_number, o.requires_refund, count(*) OVER() AS total
       FROM payments p JOIN orders o ON o.id = p.order_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return {
    total: rows[0] ? Number(rows[0]["total"]) : 0,
    items: rows.map((r) => ({
      id: r["id"], gateway: r["gateway"], method: r["method"], status: r["status"], amountCents: r["amount_cents"],
      gatewayPaymentId: r["gateway_payment_id"], orderId: r["order_id"], orderNumber: Number(r["order_number"]),
      requiresRefund: r["requires_refund"], paidAt: r["paid_at"] ? (r["paid_at"] as Date).toISOString() : null,
      createdAt: (r["created_at"] as Date).toISOString(),
    })),
  };
}

export async function listPaymentEvents(limit: number) {
  const { rows } = await pool.query<R>(`SELECT id, gateway, event_key, outcome, received_at FROM payment_events ORDER BY id DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({ id: String(r["id"]), gateway: r["gateway"], eventKey: r["event_key"], outcome: r["outcome"], receivedAt: (r["received_at"] as Date).toISOString() }));
}
