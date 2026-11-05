import { REPORT_TYPES, reportQuerySchema } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx, writeAudit } from "../audit/audit.service";
import { pool } from "../../db/pool";
import { buildReport, resolveRange } from "./reports.service";

export const reportsRouter = Router();
reportsRouter.use(authenticate, requirePermission("panel.access", "reports.read"), adminLimiter);

reportsRouter.get("/:type", asyncHandler(async (req, res) => {
  const type = z.enum(REPORT_TYPES).parse(req.params["type"]);
  const q = reportQuerySchema.parse(req.query);
  const { from, to } = resolveRange(q.from, q.to);
  const csv = await buildReport(type, from, to);
  // Relatórios têm dados de clientes: toda exportação fica registrada.
  await writeAudit(pool, auditCtx(req), { action: "report.export", entity: "report", entityId: type, after: { from, to } });
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mavi-${type}-${from}-${to}.csv"`, "Cache-Control": "no-store" }).send(csv);
}));
