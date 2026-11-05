import { hasPermission, orderActionSchema, orderListQuerySchema } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { applyAction, getAdminOrder, listOrders } from "./orders.admin.service";

export const adminOrdersRouter = Router();
adminOrdersRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

adminOrdersRouter.get("/", requirePermission("orders.read"), asyncHandler(async (req, res) => {
  res.json(await listOrders(orderListQuerySchema.parse(req.query)));
}));
adminOrdersRouter.get("/:id", requirePermission("orders.read"), asyncHandler(async (req, res) => {
  res.json(await getAdminOrder(z.string().uuid().parse(req.params["id"])));
}));

// Avançar o pedido: orders.manage. Cancelar e registrar reembolso: orders.cancel.
adminOrdersRouter.post("/:id/actions", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params["id"]);
  const input = orderActionSchema.parse(req.body);
  const needed = input.action === "cancel" || input.action === "refund_done" ? "orders.cancel" : "orders.manage";
  if (!hasPermission(req.user!.role, needed)) throw new AppError(403, "forbidden", "Você não tem permissão para esta ação.");
  res.json(await applyAction(id, input, { id: req.user!.id, role: req.user!.role }, auditCtx(req)));
}));
