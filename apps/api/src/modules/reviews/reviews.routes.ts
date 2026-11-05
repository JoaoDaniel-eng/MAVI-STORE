import { adminReviewsQuerySchema, reviewCreateSchema, reviewModerateSchema, reviewsQuerySchema } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { authenticate, optionalAuth, requirePermission } from "../../middleware/auth";
import { adminLimiter, reviewLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { adminListReviews, createReview, listReviews, moderateReview } from "./reviews.service";

const slugOf = (p: unknown) => z.string().trim().min(1).max(160).parse(p);

export const storeReviewsRouter = Router();
storeReviewsRouter.get("/products/:slug/reviews", optionalAuth, asyncHandler(async (req, res) => {
  res.json(await listReviews(slugOf(req.params["slug"]), reviewsQuerySchema.parse(req.query), req.user?.id));
}));
storeReviewsRouter.post("/products/:slug/reviews", reviewLimiter, authenticate, asyncHandler(async (req, res) => {
  await createReview(slugOf(req.params["slug"]), reviewCreateSchema.parse(req.body), req.user!.id);
  res.status(201).json({ status: "pending", message: "Avaliação enviada. Ela aparece depois de aprovada pela loja." });
}));

export const adminReviewsRouter = Router();
adminReviewsRouter.use(authenticate, requirePermission("panel.access", "reviews.moderate"), adminLimiter);
adminReviewsRouter.get("/", asyncHandler(async (req, res) => { res.json(await adminListReviews(adminReviewsQuerySchema.parse(req.query))); }));
adminReviewsRouter.patch("/:id", asyncHandler(async (req, res) => {
  res.json(await moderateReview(z.string().uuid().parse(req.params["id"]), reviewModerateSchema.parse(req.body), req.user!.id, auditCtx(req)));
}));
