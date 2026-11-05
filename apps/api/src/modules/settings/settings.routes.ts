import { SETTING_KEYS, settingUpdateSchema } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { listSettings, updateSetting } from "./settings.service";

export const settingsRouter = Router();
settingsRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

settingsRouter.get("/", requirePermission("settings.read"), asyncHandler(async (_req, res) => {
  res.json(await listSettings());
}));

settingsRouter.patch("/:key", requirePermission("settings.manage"), asyncHandler(async (req, res) => {
  const key = z.enum(SETTING_KEYS).parse(req.params["key"]);
  const { value } = settingUpdateSchema.parse(req.body);
  res.json(await updateSetting(key, value, req.user!.id, auditCtx(req)));
}));
