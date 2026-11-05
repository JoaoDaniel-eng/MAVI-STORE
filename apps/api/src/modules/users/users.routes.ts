import { createStaffSchema, listUsersQuerySchema, updateUserSchema } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { createStaff, listUsers, updateUser } from "./users.service";

export const adminUsersRouter = Router();
adminUsersRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

adminUsersRouter.get(
  "/",
  requirePermission("users.read"),
  asyncHandler(async (req, res) => {
    res.json(await listUsers(listUsersQuerySchema.parse(req.query)));
  }),
);

// A checagem fina (gerente x funcionário) fica no service.
adminUsersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createStaffSchema.parse(req.body);
    const user = await createStaff(input, req.user!, auditCtx(req));
    res.status(201).json(user);
  }),
);

adminUsersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params["id"]);
    const patch = updateUserSchema.parse(req.body);
    res.json(await updateUser(id, patch, req.user!, auditCtx(req)));
  }),
);
