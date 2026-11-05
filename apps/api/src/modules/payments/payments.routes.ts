import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { asyncHandler } from "../../lib/async";
import { authenticate, optionalAuth, requirePermission } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import { adminLimiter } from "../../middleware/rateLimits";
import { activeGateway, getGateway } from "./index";
import { createOrGetPayment, getPaymentView, listPaymentEvents, listPayments, processGatewayPayment } from "./payments.service";

const limiter = (limit: number, windowMs = 60_000) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false });
const authOf = (req: import("express").Request) => ({ token: req.get("x-order-token") ?? undefined, userId: req.user?.id });
const orderId = (req: import("express").Request) => z.string().uuid().parse(req.params["id"]);

/* Cliente: gerar/consultar a cobrança do pedido (token do pedido ou sessão). */
export const storePaymentsRouter = Router();
storePaymentsRouter.post("/orders/:id/payment", limiter(10), optionalAuth, asyncHandler(async (req, res) => {
  res.json(await createOrGetPayment(orderId(req), authOf(req)));
}));
storePaymentsRouter.get("/orders/:id/payment", limiter(60), optionalAuth, asyncHandler(async (req, res) => {
  res.json(await getPaymentView(orderId(req), authOf(req)));
}));

/* Webhooks: montados antes do csrfGuard (não usam cookie). A confirmação nunca confia no corpo recebido. */
export const webhooksRouter = Router();
webhooksRouter.post("/:gateway", limiter(120), asyncHandler(async (req, res) => {
  const gw = getGateway(String(req.params["gateway"]));
  if (!gw || !gw.configured()) throw new AppError(404, "not_found", "Não encontrado.");
  const r = { headers: req.headers as Record<string, unknown>, query: req.query as Record<string, unknown>, body: req.body as unknown };
  if (!gw.verifyWebhook(r)) throw new AppError(401, "invalid_signature", "Assinatura inválida.");

  const id = gw.paymentIdFromWebhook(r);
  if (!id) { res.status(200).json({ ignored: true }); return; }

  // Falha ao consultar o gateway vira 500: o gateway tenta de novo depois.
  const info = await gw.fetchPayment(id).catch((e: unknown) => {
    console.error("Webhook: falha ao consultar o gateway", e instanceof Error ? e.message : e);
    throw new AppError(500, "gateway_unreachable", "Falha ao consultar o gateway.");
  });
  res.status(200).json({ outcome: await processGatewayPayment(gw.id, info) });
}));

/* Painel: visão de apoio (a confirmação manual não existe de propósito). */
export const adminPaymentsRouter = Router();
adminPaymentsRouter.use(authenticate, requirePermission("panel.access", "payments.read"), adminLimiter);

adminPaymentsRouter.get("/", asyncHandler(async (req, res) => {
  const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
  res.json(await listPayments(q.limit, q.offset));
}));
adminPaymentsRouter.get("/events", asyncHandler(async (_req, res) => { res.json(await listPaymentEvents(100)); }));
adminPaymentsRouter.get("/gateway", (_req, res) => {
  const active = activeGateway();
  res.json({
    selected: env.PAYMENT_GATEWAY ?? null,
    active: active?.id ?? null,
    status: active ? "credenciais_presentes" : "pendente",
    webhookUrl: env.PAYMENT_GATEWAY && env.API_PUBLIC_URL ? `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/webhooks/${env.PAYMENT_GATEWAY}` : null,
  });
});
