import { changePasswordSchema, deleteAccountSchema, profileUpdateSchema, type AccountOrderRow } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { asyncHandler } from "../../lib/async";
import { setAuthCookies } from "../../lib/cookies";
import { authenticate } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import * as auth from "../auth/auth.service";
import { getOrder, orderToken } from "../checkout/orders.service";
import { verifyPassword } from "../../lib/passwords";
import { clearAuthCookies } from "../../lib/cookies";
import { auditCtx } from "../audit/audit.service";
import { anonymizeAccount, exportPersonalData } from "../privacy/privacy.service";
import { findById, toPublic } from "../users/users.repo";

export const accountRouter = Router();
accountRouter.use(authenticate);

// Pedidos da conta: os feitos logada e os de convidado com o mesmo e-mail, se o e-mail estiver confirmado.
const OWN = `(o.user_id = $1 OR ($2::boolean AND o.customer_email = $3))`;
async function ownerParams(userId: string) {
  const u = (await findById(pool, userId))!;
  return { params: [userId, u.email_verified_at !== null, u.email], user: u };
}

accountRouter.get("/profile", asyncHandler(async (req, res) => {
  const { user } = await ownerParams(req.user!.id);
  const m = (await pool.query<{ marketing_opt_in: boolean }>(`SELECT marketing_opt_in FROM users WHERE id = $1`, [user.id])).rows[0];
  res.json({ ...toPublic(user), emailVerified: user.email_verified_at !== null, marketingOptIn: m?.marketing_opt_in ?? false });
}));

accountRouter.patch("/profile", asyncHandler(async (req, res) => {
  const i = profileUpdateSchema.parse(req.body);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (i.name !== undefined) { params.push(i.name); sets.push(`name = $${params.length}`); }
  if (i.phone !== undefined) { params.push(i.phone); sets.push(`phone = $${params.length}`); }
  if (i.marketingOptIn !== undefined) { params.push(i.marketingOptIn); sets.push(`marketing_opt_in = $${params.length}`); }
  if (!sets.length) throw new AppError(400, "empty_update", "Nada para atualizar.");
  params.push(req.user!.id);
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  res.json(toPublic((await findById(pool, req.user!.id))!));
}));

accountRouter.post("/password", asyncHandler(async (req, res) => {
  const i = changePasswordSchema.parse(req.body);
  const session = await auth.changePassword(req.user!.id, i.currentPassword, i.newPassword, { ip: req.ip, userAgent: req.get("user-agent") });
  setAuthCookies(res, session.access, session.refresh);
  res.status(204).end();
}));

accountRouter.get("/orders", asyncHandler(async (req, res) => {
  const { params } = await ownerParams(req.user!.id);
  const { rows } = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_cents, o.created_at FROM orders o WHERE ${OWN} ORDER BY o.created_at DESC LIMIT 100`,
    params,
  );
  const out: AccountOrderRow[] = rows.map((r) => ({
    id: r.id, number: Number(r.order_number), status: r.status, paymentStatus: r.payment_status,
    totalCents: r.total_cents, createdAt: (r.created_at as Date).toISOString(),
  }));
  res.json(out);
}));

accountRouter.get("/orders/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params["id"]);
  const { params } = await ownerParams(req.user!.id);
  const own = await pool.query(`SELECT 1 FROM orders o WHERE o.id = $4 AND ${OWN}`, [...params, id]);
  if (!own.rowCount) throw new AppError(404, "not_found", "Pedido não encontrado.");
  res.json(await getOrder(id, { token: orderToken(id) })); // posse já conferida acima
}));

// LGPD: a titular baixa seus dados e pode excluir a conta (pedidos ficam pelo prazo legal).
accountRouter.get("/data-export", asyncHandler(async (req, res) => {
  const u = (await findById(pool, req.user!.id))!;
  res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="meus-dados-mavi.json"`, "Cache-Control": "no-store" })
    .send(JSON.stringify(await exportPersonalData(u.email), null, 2));
}));

accountRouter.post("/delete", asyncHandler(async (req, res) => {
  const { password } = deleteAccountSchema.parse(req.body);
  const u = (await findById(pool, req.user!.id))!;
  if (!(await verifyPassword(password, u.password_hash))) throw new AppError(400, "wrong_password", "Senha incorreta.");
  await anonymizeAccount(u.id, auditCtx(req));
  clearAuthCookies(res);
  res.status(204).end();
}));
