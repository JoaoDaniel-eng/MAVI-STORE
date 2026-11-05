import { Router } from "express";
import { getIntegrationStatus } from "../config/integrations";
import { pool } from "../db/pool";
import { authenticate, requirePermission } from "../middleware/auth";

export const healthRouter = Router();

// Leve: usado pelo health check do Render.
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "indisponivel" });
  }
});

// Só para o painel: mostra o que ainda está pendente de credencial.
healthRouter.get("/status/integrations", authenticate, requirePermission("settings.read"), (_req, res) => {
  res.json(getIntegrationStatus());
});
