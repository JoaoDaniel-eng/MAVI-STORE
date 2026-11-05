import type { AuditQuery, Role } from "@mavi/shared";
import type { Request } from "express";
import { pool, type Queryable } from "../../db/pool";

export type AuditCtx = {
  actorId: string | null;
  actorRole: Role | null;
  ip?: string | undefined;
  userAgent?: string | undefined;
};

export const auditCtx = (req: Request): AuditCtx => ({
  actorId: req.user?.id ?? null,
  actorRole: req.user?.role ?? null,
  ip: req.ip,
  userAgent: req.get("user-agent")?.slice(0, 300),
});

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

/** Passe o `client` da transação para o registro valer só se a operação for confirmada. */
export async function writeAudit(db: Queryable, ctx: AuditCtx, e: AuditEntry) {
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, entity, entity_id, before, after, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      ctx.actorId,
      ctx.actorRole,
      e.action,
      e.entity,
      e.entityId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      ctx.ip ?? null,
      ctx.userAgent ?? null,
    ],
  );
}

export async function listAudit(q: AuditQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.action) add("action = ?", q.action);
  if (q.entity) add("entity = ?", q.entity);
  if (q.actorId) add("actor_id = ?", q.actorId);
  if (q.from) add("created_at >= ?", q.from);
  if (q.to) add("created_at <= ?", q.to);
  params.push(q.limit, q.offset);

  const { rows } = await pool.query(
    `SELECT id, actor_id, actor_role, action, entity, entity_id, before, after, ip, created_at,
            count(*) OVER() AS total
       FROM audit_log
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map((r) => ({
      id: String(r.id),
      actorId: r.actor_id as string | null,
      actorRole: r.actor_role as string | null,
      action: r.action as string,
      entity: r.entity as string,
      entityId: r.entity_id as string | null,
      before: r.before as unknown,
      after: r.after as unknown,
      ip: r.ip as string | null,
      createdAt: (r.created_at as Date).toISOString(),
    })),
  };
}
