import type { PoolClient } from "pg";
import { pool } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { camel, type Row } from "../catalog/crud";
import { getSetting } from "../settings/settings.service";
import { insertMovement } from "./stock.service";

export type ReserveItem = { skuId: string; quantity: number };

/** Libera reservas vencidas (opcionalmente só dos SKUs informados). Retorna quantas liberou. */
export async function expireDue(c: PoolClient, skuIds?: string[]): Promise<number> {
  const { rows } = await c.query<{ id: string; sku_id: string; location_id: string; quantity: number }>(
    `SELECT id, sku_id, location_id, quantity FROM stock_reservations
      WHERE status = 'active' AND expires_at <= now() ${skuIds ? "AND sku_id = ANY($1::uuid[])" : ""}
      ORDER BY sku_id, location_id
      LIMIT 500 FOR UPDATE SKIP LOCKED`,
    skuIds ? [skuIds] : [],
  );
  for (const r of rows) {
    await c.query(
      `UPDATE stock_levels SET reserved = reserved - $3 WHERE sku_id = $1 AND location_id = $2`,
      [r.sku_id, r.location_id, r.quantity],
    );
    await c.query(`UPDATE stock_reservations SET status = 'expired', resolved_at = now() WHERE id = $1`, [r.id]);
  }
  return rows.length;
}

const merge = (items: ReserveItem[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.skuId, (m.get(i.skuId) ?? 0) + i.quantity);
  return [...m].map(([skuId, quantity]) => ({ skuId, quantity })).sort((a, b) => a.skuId.localeCompare(b.skuId));
};

/**
 * Reserva os itens numa única unidade. Rode dentro da transação do checkout: se um item falhar,
 * tudo é desfeito. O UPDATE condicional é atômico — duas compras da última unidade nunca passam juntas.
 */
export async function reserveItems(
  c: PoolClient,
  p: { checkoutRef: string; locationId: string; items: ReserveItem[]; ttlMinutes?: number },
) {
  const items = merge(p.items);
  await expireDue(c, items.map((i) => i.skuId));
  const ttl = p.ttlMinutes ?? (await getSetting(c, "stock.reservation_ttl_minutes"));

  const unavailable: string[] = [];
  const ids: string[] = [];
  let expiresAt: Date | undefined;
  for (const it of items) {
    const upd = await c.query(
      `UPDATE stock_levels sl SET reserved = sl.reserved + $3
         FROM skus s JOIN products pr ON pr.id = s.product_id
        WHERE sl.sku_id = $1 AND sl.location_id = $2 AND s.id = sl.sku_id
          AND s.is_active AND pr.status = 'active'
          AND sl.on_hand - sl.reserved >= $3
        RETURNING sl.sku_id`,
      [it.skuId, p.locationId, it.quantity],
    );
    if (!upd.rowCount) {
      unavailable.push(it.skuId);
      continue;
    }
    const { rows } = await c.query<{ id: string; expires_at: Date }>(
      `INSERT INTO stock_reservations (checkout_ref, sku_id, location_id, quantity, expires_at)
       VALUES ($1,$2,$3,$4, now() + make_interval(mins => $5::int)) RETURNING id, expires_at`,
      [p.checkoutRef, it.skuId, p.locationId, it.quantity, ttl],
    );
    ids.push(rows[0]!.id);
    expiresAt = rows[0]!.expires_at;
  }
  if (unavailable.length) {
    throw new AppError(409, "insufficient_stock", "Estoque insuficiente para um ou mais itens.", { skuIds: unavailable });
  }
  return { reservationIds: ids, expiresAt: expiresAt! };
}

/** Cancelamento/abandono: devolve o saldo reservado. */
export async function releaseReservations(c: PoolClient, checkoutRef: string) {
  const { rows } = await c.query<{ id: string; sku_id: string; location_id: string; quantity: number }>(
    `SELECT id, sku_id, location_id, quantity FROM stock_reservations
      WHERE checkout_ref = $1 AND status = 'active' ORDER BY sku_id, location_id FOR UPDATE`,
    [checkoutRef],
  );
  for (const r of rows) {
    await c.query(`UPDATE stock_levels SET reserved = reserved - $3 WHERE sku_id = $1 AND location_id = $2`, [r.sku_id, r.location_id, r.quantity]);
    await c.query(`UPDATE stock_reservations SET status = 'released', resolved_at = now() WHERE id = $1`, [r.id]);
  }
  return rows.length;
}

/**
 * Pagamento confirmado: transforma a reserva em baixa (movimento "sale").
 * Se a reserva já expirou, tenta baixar direto do saldo livre; sem saldo, falha com 409
 * (a Fase 7 decide o que fazer: reembolso ou reposição).
 */
export async function commitReservations(
  c: PoolClient,
  checkoutRef: string,
  ref: { type: string; id: string },
) {
  const { rows } = await c.query<Row & { id: string; sku_id: string; location_id: string; quantity: number; status: string }>(
    `SELECT id, sku_id, location_id, quantity, status FROM stock_reservations
      WHERE checkout_ref = $1 AND status IN ('active','expired','released')
      ORDER BY sku_id, location_id FOR UPDATE`,
    [checkoutRef],
  );
  if (!rows.length) throw new AppError(404, "reservation_not_found", "Reserva não encontrada.");

  const failed: string[] = [];
  for (const r of rows) {
    const q = r.quantity;
    const upd =
      r.status === "active"
        ? await c.query<{ on_hand: number }>(
            `UPDATE stock_levels SET on_hand = on_hand - $3, reserved = reserved - $3
              WHERE sku_id = $1 AND location_id = $2 AND reserved >= $3 RETURNING on_hand`,
            [r.sku_id, r.location_id, q],
          )
        : await c.query<{ on_hand: number }>(
            `UPDATE stock_levels SET on_hand = on_hand - $3
              WHERE sku_id = $1 AND location_id = $2 AND on_hand - reserved >= $3 RETURNING on_hand`,
            [r.sku_id, r.location_id, q],
          );
    if (!upd.rowCount) {
      failed.push(r.sku_id);
      continue;
    }
    await insertMovement(c, {
      skuId: r.sku_id, locationId: r.location_id, type: "sale", delta: -q, after: upd.rows[0]!.on_hand,
      refType: ref.type, refId: ref.id,
    });
    await c.query(
      `UPDATE stock_reservations SET status = 'committed', resolved_at = now(), reference_type = $2, reference_id = $3 WHERE id = $1`,
      [r.id, ref.type, ref.id],
    );
  }
  if (failed.length) {
    throw new AppError(409, "stock_unavailable", "Estoque indisponível para confirmar a venda.", { skuIds: failed });
  }
  return rows.length;
}

export async function listReservations(q: { status?: string | undefined; limit: number; offset: number }) {
  const params: unknown[] = [];
  let where = "";
  if (q.status) {
    params.push(q.status);
    where = `WHERE r.status = $1`;
  }
  params.push(q.limit, q.offset);
  const { rows } = await pool.query(
    `SELECT r.id, r.checkout_ref, r.quantity, r.status, r.expires_at, r.created_at, r.resolved_at,
            s.sku_code, l.code AS location_code, count(*) OVER() AS total
       FROM stock_reservations r JOIN skus s ON s.id = r.sku_id JOIN locations l ON l.id = r.location_id
       ${where} ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? Number((rows[0] as Row)["total"]) : 0,
    items: rows.map((r) => {
      const { total: _t, ...rest } = camel(r as Row);
      return rest;
    }),
  };
}
