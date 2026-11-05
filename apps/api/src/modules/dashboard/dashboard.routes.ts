import { customersQuerySchema, dashboardQuerySchema } from "@mavi/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { getDashboard, listCustomers } from "./dashboard.service";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

dashboardRouter.get("/dashboard", requirePermission("dashboard.read"), asyncHandler(async (req, res) => {
  res.json(await getDashboard(dashboardQuerySchema.parse(req.query).days));
}));
// Dados de clientes: mesma permissão da lista de usuários (Proprietária e Gerente).
dashboardRouter.get("/customers", requirePermission("users.read"), asyncHandler(async (req, res) => {
  res.json(await listCustomers(customersQuerySchema.parse(req.query)));
}));
