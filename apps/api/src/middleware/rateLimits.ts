import rateLimit, { type Options } from "express-rate-limit";

const common: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Muitas tentativas. Tente novamente em alguns minutos." } },
};

const emailOf = (body: unknown) =>
  String((body as { email?: unknown } | undefined)?.email ?? "").toLowerCase().slice(0, 254);

// Contagem em memória: vale para uma instância. Com várias instâncias, trocar por store compartilhado.
export const loginByAccountLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: (req) => `${req.ip}|${emailOf(req.body)}`,
});
export const loginByIpLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 40 });
export const registerLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 10 });
export const refreshLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 60 });
export const adminLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 120 });

export const quoteLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 60 });
export const shippingLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 20 }); // chama API externa
export const checkoutLimiter = rateLimit({ ...common, windowMs: 10 * 60_000, limit: 15 });

export const authTokenLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 10 });
export const reviewLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 10 });
