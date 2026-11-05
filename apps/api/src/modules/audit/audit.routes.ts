import { auditQuerySchema } from "@mavi/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { listAudit } from "./audit.service";

export const auditRouter = Router();
auditRouter.use(authenticate, requirePermission("panel.access", "audit.read"), adminLimiter);

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listAudit(auditQuerySchema.parse(req.query)));
  }),
);
