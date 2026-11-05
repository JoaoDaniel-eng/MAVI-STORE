import {
  hasPermission,
  type CreateStaffInput,
  type ListUsersQuery,
  type Permission,
  type Role,
  type UpdateUserInput,
} from "@mavi/shared";
import { pool, withTransaction } from "../../db/pool";
import { hashPassword } from "../../lib/passwords";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";
import { COLS, PUBLIC_COLS, toPublic, type UserRow } from "./users.repo";

type Actor = { id: string; role: Role };

// Quem pode alterar cada perfil. Contas "owner" não são alteráveis pela API.
const MANAGE_PERMISSION: Record<Role, Permission | null> = {
  owner: null,
  manager: "users.manage_managers",
  staff: "users.manage_staff",
  customer: "users.manage_customers",
};

const forbidden = () => new AppError(403, "forbidden", "Você não tem permissão para esta ação.");

export async function listUsers(q: ListUsersQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.role) {
    params.push(q.role);
    where.push(`role = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  params.push(q.limit, q.offset);

  const { rows } = await pool.query<UserRow & { total: string }>(
    `SELECT ${PUBLIC_COLS}, count(*) OVER() AS total FROM users
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { total: rows[0] ? Number(rows[0].total) : 0, items: rows.map(toPublic) };
}

export async function createStaff(input: CreateStaffInput, actor: Actor, ctx: AuditCtx) {
  const needed: Permission = input.role === "manager" ? "users.manage_managers" : "users.manage_staff";
  if (!hasPermission(actor.role, needed)) throw forbidden();

  const hash = await hashPassword(input.password);
  try {
    return await withTransaction(async (c) => {
      const { rows } = await c.query<UserRow>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`,
        [input.email, hash, input.name, input.role],
      );
      const user = toPublic(rows[0]!);
      await writeAudit(c, ctx, { action: "user.create", entity: "user", entityId: user.id, after: user });
      return user;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      throw new AppError(409, "email_in_use", "Este e-mail já está cadastrado.");
    }
    throw e;
  }
}

export async function updateUser(id: string, patch: UpdateUserInput, actor: Actor, ctx: AuditCtx) {
  return withTransaction(async (c) => {
    const { rows } = await c.query<UserRow>(`SELECT ${COLS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
    const target = rows[0];
    if (!target) throw new AppError(404, "not_found", "Usuário não encontrado.");

    const perm = MANAGE_PERMISSION[target.role];
    if (!perm || !hasPermission(actor.role, perm)) throw forbidden();

    if (target.id === actor.id && (patch.role !== undefined || patch.isActive !== undefined)) {
      throw new AppError(403, "cannot_modify_self", "Você não pode alterar seu próprio perfil ou status.");
    }
    if (patch.role !== undefined) {
      if (target.role === "customer") {
        throw new AppError(400, "invalid_role_change", "Clientes não mudam de perfil por aqui.");
      }
      const needed = MANAGE_PERMISSION[patch.role];
      if (!needed || !hasPermission(actor.role, needed)) throw forbidden();
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.name !== undefined) set("name", patch.name);
    if (patch.role !== undefined) set("role", patch.role);
    if (patch.isActive !== undefined) set("is_active", patch.isActive);
    params.push(id);

    const updated = (
      await c.query<UserRow>(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${COLS}`,
        params,
      )
    ).rows[0]!;

    const revoke = patch.isActive === false || (patch.role !== undefined && patch.role !== target.role);
    if (revoke) {
      await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    }

    await writeAudit(c, ctx, {
      action: "user.update",
      entity: "user",
      entityId: id,
      before: toPublic(target),
      after: toPublic(updated),
    });
    return toPublic(updated);
  });
}
