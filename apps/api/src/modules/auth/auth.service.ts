import crypto from "node:crypto";
import type { LoginInput, RegisterInput, Role } from "@mavi/shared";
import { env } from "../../config/env";
import type { PoolClient } from "pg";
import { pool, withTransaction, type Queryable } from "../../db/pool";
import { hashPassword, verifyPassword } from "../../lib/passwords";
import { hashToken, newRefreshToken, signAccess } from "../../lib/tokens";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";
import { enqueueEmail } from "../email/outbox";
import { siteLink } from "../email/templates";
import { COLS, findByEmail, toPublic, type UserRow } from "../users/users.repo";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

type Meta = { ip?: string | undefined; userAgent?: string | undefined };
type Session = { access: string; refresh: string };

const invalid = () => new AppError(401, "invalid_credentials", "E-mail ou senha incorretos.");

async function createSession(
  db: Queryable,
  userId: string,
  role: Role,
  meta: Meta,
  familyId: string = crypto.randomUUID(),
): Promise<Session> {
  const refresh = newRefreshToken();
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1,$2,$3,$4, now() + make_interval(days => $5::int), $6, $7)`,
    [
      crypto.randomUUID(),
      userId,
      familyId,
      hashToken(refresh),
      env.REFRESH_TOKEN_TTL_DAYS,
      meta.userAgent ?? null,
      meta.ip ?? null,
    ],
  );
  return { access: signAccess({ sub: userId, role }), refresh };
}

export async function register(input: RegisterInput, meta: Meta) {
  const hash = await hashPassword(input.password);
  try {
    return await withTransaction(async (c) => {
      const { rows } = await c.query<UserRow>(
        `INSERT INTO users (email, password_hash, name, phone, role, terms_accepted_at, marketing_opt_in)
         VALUES ($1,$2,$3,$4,'customer', now(), $5) RETURNING ${COLS}`,
        [input.email, hash, input.name, input.phone ?? null, input.marketingOptIn],
      );
      const user = rows[0]!;
      const session = await createSession(c, user.id, user.role, meta);
      await sendVerification(c, user);
      return { user: toPublic(user), session };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      throw new AppError(409, "email_in_use", "Este e-mail já está cadastrado.");
    }
    throw e;
  }
}

/* ---------- Tokens de uso único: confirmação de e-mail e redefinição de senha ---------- */
async function createAuthToken(db: Queryable, userId: string, kind: "password_reset" | "email_verification", ttlMinutes: number) {
  const raw = newRefreshToken();
  await db.query(
    `UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL`, // só o último link vale
    [userId, kind],
  );
  await db.query(
    `INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(mins => $4::int))`,
    [userId, kind, hashToken(raw), ttlMinutes],
  );
  return raw;
}

async function sendVerification(db: Queryable, user: { id: string; email: string; name: string }) {
  const raw = await createAuthToken(db, user.id, "email_verification", 60 * 24 * 3);
  await enqueueEmail(db, user.email, "verify_email", { name: user.name, link: siteLink(`/verificar-email?token=${raw}`) });
}

export async function resendVerification(userId: string) {
  await withTransaction(async (c) => {
    const u = (await c.query<UserRow>(`SELECT ${COLS} FROM users WHERE id = $1`, [userId])).rows[0];
    if (!u || u.email_verified_at) return;
    await sendVerification(c, u);
  });
}

/** Responde sempre igual, exista a conta ou não (não revela cadastros). */
export async function forgotPassword(email: string) {
  const user = await findByEmail(pool, email);
  if (!user || !user.is_active) return;
  await withTransaction(async (c) => {
    const raw = await createAuthToken(c, user.id, "password_reset", 60);
    await enqueueEmail(c, user.email, "password_reset", { name: user.name, link: siteLink(`/redefinir-senha?token=${raw}`) });
  });
}

async function consumeToken(c: PoolClient, raw: string, kind: "password_reset" | "email_verification") {
  const { rows } = await c.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM auth_tokens WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
    [hashToken(raw), kind],
  );
  const t = rows[0];
  if (!t) throw new AppError(400, "invalid_token", "Link inválido ou expirado.");
  await c.query(`UPDATE auth_tokens SET used_at = now() WHERE id = $1`, [t.id]);
  return t.user_id;
}

export async function resetPassword(raw: string, password: string) {
  const hash = await hashPassword(password);
  await withTransaction(async (c) => {
    const userId = await consumeToken(c, raw, "password_reset");
    await c.query(`UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1`, [userId, hash]);
    await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]); // encerra todas as sessões
    const u = (await c.query<{ role: Role }>(`SELECT role FROM users WHERE id = $1`, [userId])).rows[0];
    if (u && u.role !== "customer") {
      await writeAudit(c, { actorId: userId, actorRole: u.role }, { action: "auth.password_reset", entity: "user", entityId: userId });
    }
  });
}

export async function verifyEmail(raw: string) {
  await withTransaction(async (c) => {
    const userId = await consumeToken(c, raw, "email_verification");
    await c.query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [userId]);
  });
}

export async function changePassword(userId: string, current: string, next: string, meta: Meta) {
  const u = (await pool.query<UserRow>(`SELECT ${COLS} FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u || !(await verifyPassword(current, u.password_hash))) throw new AppError(400, "wrong_password", "Senha atual incorreta.");
  const hash = await hashPassword(next);
  return withTransaction(async (c) => {
    await c.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, hash]);
    await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    return createSession(c, userId, u.role, meta); // mantém esta sessão
  });
}

export async function login(input: LoginInput, ctx: AuditCtx) {
  const user = await findByEmail(pool, input.email);
  const passwordOk = await verifyPassword(input.password, user?.password_hash);

  if (user && user.locked_until && user.locked_until > new Date()) {
    throw new AppError(429, "account_locked", "Conta bloqueada temporariamente. Tente novamente em alguns minutos.");
  }

  if (!user || !user.is_active || !passwordOk) {
    if (user && user.is_active) {
      await pool.query(
        `UPDATE users SET
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3::int) ELSE locked_until END,
           failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END
         WHERE id = $1`,
        [user.id, MAX_FAILS, LOCK_MINUTES],
      );
      if (user.role !== "customer") {
        await writeAudit(pool, ctx, { action: "auth.login_failed", entity: "user", entityId: user.id });
      }
    }
    throw invalid();
  }

  const session = await withTransaction(async (c) => {
    await c.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );
    const s = await createSession(c, user.id, user.role, ctx);
    if (user.role !== "customer") {
      await writeAudit(c, { ...ctx, actorId: user.id, actorRole: user.role }, {
        action: "auth.login",
        entity: "user",
        entityId: user.id,
      });
    }
    return s;
  });
  return { user: toPublic(user), session };
}

/** Rotaciona o refresh token. Reuso de um token já revogado revoga toda a família. */
export async function refresh(raw: string, meta: Meta) {
  const outcome = await withTransaction(async (c) => {
    const { rows } = await c.query<{
      id: string;
      family_id: string;
      user_id: string;
      revoked_at: Date | null;
      expired: boolean;
    }>(
      `SELECT id, family_id, user_id, revoked_at, expires_at <= now() AS expired
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hashToken(raw)],
    );
    const rt = rows[0];
    if (!rt) return { kind: "invalid" as const };

    if (rt.revoked_at) {
      await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [
        rt.family_id,
      ]);
      return { kind: "reuse" as const };
    }

    const user = (await c.query<UserRow>(`SELECT ${COLS} FROM users WHERE id = $1`, [rt.user_id])).rows[0];
    if (rt.expired || !user || !user.is_active) return { kind: "invalid" as const };

    await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [rt.id]);
    const session = await createSession(c, user.id, user.role, meta, rt.family_id);
    return { kind: "ok" as const, user: toPublic(user), session };
  });

  if (outcome.kind !== "ok") throw new AppError(401, "invalid_session", "Sessão expirada. Faça login novamente.");
  return outcome;
}

export async function logout(raw: string | undefined) {
  if (!raw) return;
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE revoked_at IS NULL
        AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
    [hashToken(raw)],
  );
}
