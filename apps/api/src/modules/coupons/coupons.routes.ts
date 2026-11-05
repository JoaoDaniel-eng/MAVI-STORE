import { couponCreateSchema, couponUpdateSchema } from "@mavi/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { createRow, deleteRow, listRows, updateRow, type Def } from "../catalog/crud";

const coupons: Def = { table: "coupons", entity: "coupon", order: "created_at DESC" };
export const couponsRouter = Router();
couponsRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);
const idOf = (req: Request) => z.string().uuid().parse(req.params["id"]);

couponsRouter.get("/", requirePermission("coupons.read"), asyncHandler(async (_req, res) => { res.json(await listRows(coupons)); }));

couponsRouter.post("/", requirePermission("coupons.manage"), asyncHandler(async (req, res) => {
  const i = couponCreateSchema.parse(req.body);
  res.status(201).json(await createRow(coupons, {
    code: i.code, type: i.type, value: i.value ?? 0, description: i.description ?? null,
    min_subtotal_cents: i.minSubtotalCents ?? 0, max_discount_cents: i.maxDiscountCents ?? null,
    starts_at: i.startsAt ?? null, ends_at: i.endsAt ?? null, usage_limit: i.usageLimit ?? null,
    per_customer_limit: i.perCustomerLimit ?? null, is_active: i.isActive ?? true,
  }, auditCtx(req)));
}));

couponsRouter.patch("/:id", requirePermission("coupons.manage"), asyncHandler(async (req, res) => {
  const i = couponUpdateSchema.parse(req.body);
  res.json(await updateRow(coupons, idOf(req), {
    description: i.description, value: i.value, min_subtotal_cents: i.minSubtotalCents, max_discount_cents: i.maxDiscountCents,
    starts_at: i.startsAt, ends_at: i.endsAt, usage_limit: i.usageLimit, per_customer_limit: i.perCustomerLimit, is_active: i.isActive,
  }, auditCtx(req)));
}));

// Cupom já usado não pode ser apagado (409): desative-o.
couponsRouter.delete("/:id", requirePermission("coupons.manage"), asyncHandler(async (req, res) => {
  await deleteRow(coupons, idOf(req), auditCtx(req));
  res.status(204).end();
}));
