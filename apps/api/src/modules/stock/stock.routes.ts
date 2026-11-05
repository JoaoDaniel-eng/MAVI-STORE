import {
  movementCreateSchema, movementsQuerySchema, reservationsQuerySchema, stockListQuerySchema,
  thresholdSchema, transferSchema,
} from "@mavi/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/async";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { listReservations } from "./reservations.service";
import { createMovement, listMovements, listStock, setThreshold, transferStock } from "./stock.service";

export const stockRouter = Router();
stockRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

const read = requirePermission("stock.read");
const move = requirePermission("stock.move");
const adjust = requirePermission("stock.adjust");

stockRouter.get("/", read, asyncHandler(async (req, res) => {
  res.json(await listStock(stockListQuerySchema.parse(req.query)));
}));

// Alerta de baixo estoque: SKUs ativos com disponível <= limite.
stockRouter.get("/alerts", read, asyncHandler(async (req, res) => {
  res.json(await listStock({ ...stockListQuerySchema.parse(req.query), lowOnly: true }));
}));

stockRouter.get("/movements", read, asyncHandler(async (req, res) => {
  res.json(await listMovements(movementsQuerySchema.parse(req.query)));
}));

stockRouter.get("/reservations", read, asyncHandler(async (req, res) => {
  res.json(await listReservations(reservationsQuerySchema.parse(req.query)));
}));

stockRouter.post("/movements", asyncHandler(async (req, res, next) => {
  const input = movementCreateSchema.parse(req.body);
  // Entrada/saída: stock.move. Ajuste de contagem: stock.adjust.
  const guard = input.type === "adjustment" ? adjust : move;
  guard(req, res, (err) => {
    if (err) return next(err);
    createMovement(input, req.user!.id, auditCtx(req)).then((r) => res.status(201).json(r), next);
  });
}));

stockRouter.post("/transfers", move, asyncHandler(async (req, res) => {
  res.status(201).json(await transferStock(transferSchema.parse(req.body), req.user!.id, auditCtx(req)));
}));

stockRouter.put("/thresholds", adjust, asyncHandler(async (req, res) => {
  res.json(await setThreshold(thresholdSchema.parse(req.body), auditCtx(req)));
}));
