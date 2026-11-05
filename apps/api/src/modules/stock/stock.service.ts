import crypto from "node:crypto";
import type {
  MovementCreateInput, MovementsQuery, MovementType, StockListQuery, TransferInput,
} from "@mavi/shared";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";
import { camel, type Row } from "../catalog/crud";

type Level = { on_hand: number; reserved: number };

export function stockError(e: unknown): unknown {
  const code = (e as { code?: string }).code;
  if (code === "23503") return new AppError(400, "invalid_reference", "SKU ou unidade não encontrado.");
  if (code === "23514") return new AppError(409, "insufficient_stock", "Operação deixaria o estoque inválido.");
  return e;
}

/** Garante a linha do saldo e a trava (FOR UPDATE) até o fim da transação. */
export async function lockLevel(c: PoolClient, skuId: string, locationId: string): Promise<Level> {
  await c.query(
    `INSERT INTO stock_levels (sku_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [skuId, locationId],
  );
  const { rows } = await c.query<Level>(
    `SELECT on_hand, reserved FROM stock_levels WHERE sku_id = $1 AND location_id = $2 FOR UPDATE`,
    [skuId, locationId],
  );
  return rows[0]!;
}

export async function insertMovement(
  c: PoolClient,
  m: {
    skuId: string; locationId: string; type: MovementType; delta: number; after: number;
    reason?: string | null; actorId?: string | null; transferId?: string | null;
    refType?: string | null; refId?: string | null;
  },
) {
  await c.query(
    `INSERT INTO stock_movements (sku_id, location_id, type, quantity_delta, on_hand_after, reason,
        transfer_id, reference_type, reference_id, actor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [m.skuId, m.locationId, m.type, m.delta, m.after, m.reason ?? null, m.transferId ?? null,
     m.refType ?? null, m.refId ?? null, m.actorId ?? null],
  );
}

export async function createMovement(input: MovementCreateInput, actorId: string, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      const lvl = await lockLevel(c, input.skuId, input.locationId);
      let delta: number;
      if (input.type === "entry") {
        delta = input.quantity;
      } else if (input.type === "exit") {
        if (lvl.on_hand - lvl.reserved < input.quantity) {
          throw new AppError(409, "insufficient_stock", "Saldo disponível insuficiente (há itens reservados).");
        }
        delta = -input.quantity;
      } else {
        if (input.newOnHand < lvl.reserved) {
          throw new AppError(422, "below_reserved", `Há ${lvl.reserved} unidade(s) reservada(s); o saldo não pode ficar abaixo disso.`);
        }
        delta = input.newOnHand - lvl.on_hand;
        if (delta === 0) throw new AppError(400, "no_change", "O saldo informado é igual ao atual.");
      }
      const after = lvl.on_hand + delta;
      await c.query(`UPDATE stock_levels SET on_hand = $3 WHERE sku_id = $1 AND location_id = $2`, [
        input.skuId, input.locationId, after,
      ]);
      await insertMovement(c, {
        skuId: input.skuId, locationId: input.locationId, type: input.type, delta, after,
        reason: input.reason ?? null, actorId,
      });
      if (input.type === "adjustment") {
        await writeAudit(c, ctx, {
          action: "stock.adjust", entity: "stock", entityId: `${input.skuId}:${input.locationId}`,
          before: { onHand: lvl.on_hand }, after: { onHand: after, reason: input.reason },
        });
      }
      return { skuId: input.skuId, locationId: input.locationId, onHand: after, reserved: lvl.reserved, available: after - lvl.reserved };
    });
  } catch (e) {
    throw stockError(e);
  }
}

export async function transferStock(input: TransferInput, actorId: string, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      const transferId = crypto.randomUUID();
      // Ordem fixa de travas (SKU, depois unidade) evita deadlock entre transferências concorrentes.
      const items = [...input.items].sort((a, b) => a.skuId.localeCompare(b.skuId));
      const [first, second] = [input.fromLocationId, input.toLocationId].sort();
      for (const it of items) {
        const lock = new Map<string, Level>();
        lock.set(first!, await lockLevel(c, it.skuId, first!));
        lock.set(second!, await lockLevel(c, it.skuId, second!));
        const from = lock.get(input.fromLocationId)!;
        const to = lock.get(input.toLocationId)!;
        if (from.on_hand - from.reserved < it.quantity) {
          throw new AppError(409, "insufficient_stock", "Saldo disponível insuficiente na unidade de origem.", {
            skuId: it.skuId, available: from.on_hand - from.reserved,
          });
        }
        const fromAfter = from.on_hand - it.quantity;
        const toAfter = to.on_hand + it.quantity;
        await c.query(`UPDATE stock_levels SET on_hand = $3 WHERE sku_id = $1 AND location_id = $2`, [it.skuId, input.fromLocationId, fromAfter]);
        await c.query(`UPDATE stock_levels SET on_hand = $3 WHERE sku_id = $1 AND location_id = $2`, [it.skuId, input.toLocationId, toAfter]);
        await insertMovement(c, { skuId: it.skuId, locationId: input.fromLocationId, type: "transfer_out", delta: -it.quantity, after: fromAfter, reason: input.reason ?? null, actorId, transferId });
        await insertMovement(c, { skuId: it.skuId, locationId: input.toLocationId, type: "transfer_in", delta: it.quantity, after: toAfter, reason: input.reason ?? null, actorId, transferId });
      }
      await writeAudit(c, ctx, {
        action: "stock.transfer", entity: "stock", entityId: transferId,
        after: { from: input.fromLocationId, to: input.toLocationId, items: input.items, reason: input.reason },
      });
      return { transferId, items: input.items.length };
    });
  } catch (e) {
    throw stockError(e);
  }
}

export async function setThreshold(
  p: { skuId: string; locationId: string; threshold: number | null },
  ctx: AuditCtx,
) {
  try {
    return await withTransaction(async (c) => {
      const before = await lockLevel(c, p.skuId, p.locationId);
      await c.query(
        `UPDATE stock_levels SET low_stock_threshold = $3 WHERE sku_id = $1 AND location_id = $2`,
        [p.skuId, p.locationId, p.threshold],
      );
      await writeAudit(c, ctx, {
        action: "stock.threshold", entity: "stock", entityId: `${p.skuId}:${p.locationId}`,
        before: { onHand: before.on_hand }, after: { threshold: p.threshold },
      });
      return p;
    });
  } catch (e) {
    throw stockError(e);
  }
}

export async function listStock(q: StockListQuery) {
  const params: unknown[] = [];
  const where: string[] = ["l.is_active", "p.status <> 'archived'"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.locationId) add("l.id = ?", q.locationId);
  if (q.productId) add("p.id = ?", q.productId);
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(s.sku_code ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  if (q.lowOnly) {
    where.push("s.is_active");
    where.push("(COALESCE(sl.on_hand,0) - COALESCE(sl.reserved,0)) <= COALESCE(sl.low_stock_threshold, thr.d)");
  }
  params.push(q.limit, q.offset);

  const { rows } = await pool.query<Row>(
    `WITH thr AS (
       SELECT COALESCE((SELECT (value->>'default')::int FROM settings WHERE key = 'stock.low_stock_threshold'), 3) AS d
     )
     SELECT s.id AS sku_id, s.sku_code, s.is_active AS sku_active, p.id AS product_id, p.name AS product_name,
            col.name AS color_name, z.label AS size_label, l.id AS location_id, l.code AS location_code,
            COALESCE(sl.on_hand,0) AS on_hand, COALESCE(sl.reserved,0) AS reserved,
            COALESCE(sl.on_hand,0) - COALESCE(sl.reserved,0) AS available,
            COALESCE(sl.low_stock_threshold, thr.d) AS threshold,
            (COALESCE(sl.on_hand,0) - COALESCE(sl.reserved,0)) <= COALESCE(sl.low_stock_threshold, thr.d) AS is_low,
            count(*) OVER() AS total
       FROM skus s
       JOIN products p ON p.id = s.product_id
       JOIN colors col ON col.id = s.color_id
       JOIN sizes z ON z.id = s.size_id
       CROSS JOIN locations l
       CROSS JOIN thr
       LEFT JOIN stock_levels sl ON sl.sku_id = s.id AND sl.location_id = l.id
      WHERE ${where.join(" AND ")}
      ORDER BY p.name, col.name, z.sort_order, l.sort_order
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? Number(rows[0]["total"]) : 0,
    items: rows.map((r) => {
      const { total: _t, ...rest } = camel(r);
      return { ...rest, onHand: Number(rest["onHand"]), reserved: Number(rest["reserved"]), available: Number(rest["available"]), threshold: Number(rest["threshold"]) };
    }),
  };
}

export async function listMovements(q: MovementsQuery) {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.skuId) add("m.sku_id = ?", q.skuId);
  if (q.locationId) add("m.location_id = ?", q.locationId);
  if (q.type) add("m.type = ?", q.type);
  if (q.from) add("m.created_at >= ?", q.from);
  if (q.to) add("m.created_at <= ?", q.to);
  params.push(q.limit, q.offset);

  const { rows } = await pool.query<Row>(
    `SELECT m.id, m.type, m.quantity_delta, m.on_hand_after, m.reason, m.transfer_id, m.reference_type,
            m.reference_id, m.created_at, s.id AS sku_id, s.sku_code, p.name AS product_name,
            l.code AS location_code, u.name AS actor_name, count(*) OVER() AS total
       FROM stock_movements m
       JOIN skus s ON s.id = m.sku_id
       JOIN products p ON p.id = s.product_id
       JOIN locations l ON l.id = m.location_id
       LEFT JOIN users u ON u.id = m.actor_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? Number(rows[0]["total"]) : 0,
    items: rows.map((r) => {
      const { total: _t, ...rest } = camel(r);
      return { ...rest, id: String(rest["id"]) };
    }),
  };
}
