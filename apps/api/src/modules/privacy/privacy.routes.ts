import { privacyEmailSchema } from "@mavi/shared";
import { Router } from "express";
import { pool } from "../../db/pool";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx, writeAudit } from "../audit/audit.service";
import { anonymizeAccount, exportPersonalData } from "./privacy.service";

/** Atendimento a pedidos de titulares feitos à loja (só a Proprietária). */
export const adminPrivacyRouter = Router();
adminPrivacyRouter.use(authenticate, requirePermission("panel.access", "privacy.manage"), adminLimiter);

adminPrivacyRouter.post("/export", asyncHandler(async (req, res) => {
  const { email } = privacyEmailSchema.parse(req.body);
  const data = await exportPersonalData(email);
  await writeAudit(pool, auditCtx(req), { action: "privacy.export", entity: "person", entityId: "email" }); // não grava o e-mail
  res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="dados-pessoais.json"`, "Cache-Control": "no-store" }).send(JSON.stringify(data, null, 2));
}));

adminPrivacyRouter.post("/anonymize", asyncHandler(async (req, res) => {
  const { email } = privacyEmailSchema.parse(req.body);
  const u = (await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND role = 'customer'`, [email])).rows[0];
  if (!u) throw new AppError(404, "not_found", "Não há conta de cliente com este e-mail. Pedidos de visitantes são mantidos pelo prazo legal e anonimizados depois dele.");
  await anonymizeAccount(u.id, auditCtx(req));
  res.status(204).end();
}));
