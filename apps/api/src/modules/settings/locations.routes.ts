import { locationUpdateSchema } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { listRows, updateRow, type Def } from "../catalog/crud";

const locations: Def = { table: "locations", entity: "location", order: "sort_order" };
export const locationsRouter = Router();
locationsRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

locationsRouter.get("/", requirePermission("settings.read"), asyncHandler(async (_req, res) => { res.json(await listRows(locations)); }));

locationsRouter.patch("/:id", requirePermission("settings.manage"), asyncHandler(async (req, res) => {
  const i = locationUpdateSchema.parse(req.body);
  res.json(await updateRow(locations, z.string().uuid().parse(req.params["id"]), {
    name: i.name, address: i.address, postal_code: i.postalCode, phone: i.phone, whatsapp: i.whatsapp,
    opening_hours: i.openingHours === undefined ? undefined : i.openingHours === null ? null : JSON.stringify(i.openingHours),
    pickup_enabled: i.pickupEnabled, pickup_fee_cents: i.pickupFeeCents, can_ship_from: i.canShipFrom, is_active: i.isActive,
  }, auditCtx(req)));
}));
