import { cartItemsSchema, cartQuoteSchema, checkoutSchema, shippingQuoteSchema, type CartQuote } from "@mavi/shared";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { asyncHandler } from "../../lib/async";
import { optionalAuth } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import { checkoutLimiter, quoteLimiter, shippingLimiter } from "../../middleware/rateLimits";
import { evaluateCoupon } from "../coupons/coupons.service";
import { createOrder, enabledPaymentMethods, getOrder } from "./orders.service";
import { priceItems, subtotalOf } from "./pricing.service";
import { pickupOptions, shippingQuoteResponse } from "./shipping.service";

export const checkoutRouter = Router();

checkoutRouter.post("/cart/quote", quoteLimiter, optionalAuth, asyncHandler(async (req, res) => {
  const input = cartQuoteSchema.parse(req.body);
  const lines = await priceItems(pool, input.items);
  const subtotalCents = subtotalOf(lines);
  let coupon: CartQuote["coupon"] = null;
  let couponError: string | null = null;
  if (input.couponCode) {
    try {
      const r = await evaluateCoupon(pool, input.couponCode, { subtotalCents, shippingCents: 0, userId: req.user?.id });
      coupon = { code: r.coupon.code, type: r.coupon.type, discountCents: r.discountCents, freeShipping: r.coupon.type === "free_shipping" };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      couponError = e.message;
    }
  }
  const body: CartQuote = { lines, subtotalCents, coupon, couponError, hasProblems: lines.some((l) => l.problem) };
  res.json(body);
}));

checkoutRouter.post("/shipping/quote", shippingLimiter, asyncHandler(async (req, res) => {
  const input = shippingQuoteSchema.parse(req.body);
  res.json(await shippingQuoteResponse(input.items, input.postalCode));
}));

// Retirada não usa transportadora: só confere o estoque de cada unidade.
checkoutRouter.post("/pickup/options", quoteLimiter, asyncHandler(async (req, res) => {
  res.json(await pickupOptions(cartItemsSchema.parse((req.body as { items?: unknown }).items)));
}));

checkoutRouter.get("/checkout/options", asyncHandler(async (_req, res) => {
  res.json({ paymentMethods: await enabledPaymentMethods() });
}));

checkoutRouter.post("/checkout/orders", checkoutLimiter, optionalAuth, asyncHandler(async (req, res) => {
  const key = z.string().trim().min(16).max(100).parse(req.get("idempotency-key"));
  const input = checkoutSchema.parse(req.body);
  const { order, replay } = await createOrder(input, key, req.user?.id);
  res.status(replay ? 200 : 201).json(order);
}));

checkoutRouter.get("/orders/:id", optionalAuth, asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params["id"]);
  res.json(await getOrder(id, { token: req.get("x-order-token") ?? undefined, userId: req.user?.id }));
}));
