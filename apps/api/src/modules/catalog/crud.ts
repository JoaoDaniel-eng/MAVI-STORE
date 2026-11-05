import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";

export type Row = Record<string, unknown>;
export type Def = { table: string; entity: string; order: string };

const camelKey = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function camel(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camelKey(k)] = v instanceof Date ? v.toISOString() : v;
  return out;
}

export function mapPgError(e: unknown): unknown {
  const code = (e as { code?: string }).code;
  if (code === "23505") return new AppError(409, "duplicate", "Já existe um registro com esses dados.");
  if (code === "23503") return new AppError(409, "in_use", "Registro em uso por outros dados.");
  if (code === "23514") return new AppError(422, "invalid_value", "Valor fora do permitido.");
  return e;
}

/** Nomes de tabela/coluna vêm sempre do código; só os valores vêm do usuário. */
export function buildUpdate(table: string, id: string, fields: Row) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) throw new AppError(400, "empty_update", "Nada para atualizar.");
  return {
    sql: `UPDATE ${table} SET ${entries.map(([c], i) => `${c} = $${i + 1}`).join(", ")} WHERE id = $${entries.length + 1} RETURNING *`,
    params: [...entries.map(([, v]) => v), id],
  };
}

export async function listRows(def: Def) {
  const { rows } = await pool.query<Row>(`SELECT * FROM ${def.table} ORDER BY ${def.order}`);
  return rows.map(camel);
}

export async function createRow(
  def: Def,
  values: Row,
  ctx: AuditCtx,
  check?: (c: PoolClient) => Promise<void>,
) {
  try {
    return await withTransaction(async (c) => {
      await check?.(c);
      const cols = Object.keys(values);
      const { rows } = await c.query<Row>(
        `INSERT INTO ${def.table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
        Object.values(values),
      );
      const row = camel(rows[0]!);
      await writeAudit(c, ctx, { action: `${def.entity}.create`, entity: def.entity, entityId: String(row["id"]), after: row });
      return row;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function updateRow(
  def: Def,
  id: string,
  values: Row,
  ctx: AuditCtx,
  check?: (c: PoolClient) => Promise<void>,
) {
  try {
    return await withTransaction(async (c) => {
      const before = (await c.query<Row>(`SELECT * FROM ${def.table} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new AppError(404, "not_found", "Registro não encontrado.");
      await check?.(c);
      const { sql, params } = buildUpdate(def.table, id, values);
      const after = camel((await c.query<Row>(sql, params)).rows[0]!);
      await writeAudit(c, ctx, { action: `${def.entity}.update`, entity: def.entity, entityId: id, before: camel(before), after });
      return after;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function deleteRow(def: Def, id: string, ctx: AuditCtx) {
  try {
    await withTransaction(async (c) => {
      const { rows } = await c.query<Row>(`DELETE FROM ${def.table} WHERE id = $1 RETURNING *`, [id]);
      if (!rows[0]) throw new AppError(404, "not_found", "Registro não encontrado.");
      await writeAudit(c, ctx, { action: `${def.entity}.delete`, entity: def.entity, entityId: id, before: camel(rows[0]) });
    });
  } catch (e) {
    throw mapPgError(e);
  }
}
