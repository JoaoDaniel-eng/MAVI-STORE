import { forgotPasswordSchema, loginSchema, permissionsOf, registerSchema, resetPasswordSchema, verifyEmailSchema } from "@mavi/shared";
import { Router } from "express";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "../../lib/cookies";
import { asyncHandler } from "../../lib/async";
import { authenticate } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import {
  authTokenLimiter,
  loginByAccountLimiter,
  loginByIpLimiter,
  refreshLimiter,
  registerLimiter,
} from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import * as auth from "./auth.service";

export const authRouter = Router();

authRouter.post(
  "/register",
  registerLimiter,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const { user, session } = await auth.register(input, { ip: req.ip, userAgent: req.get("user-agent") });
    setAuthCookies(res, session.access, session.refresh);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  "/login",
  loginByIpLimiter,
  loginByAccountLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, session } = await auth.login(input, auditCtx(req));
    setAuthCookies(res, session.access, session.refresh);
    res.json({ user, permissions: permissionsOf(user.role) });
  }),
);

authRouter.post(
  "/refresh",
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw new AppError(401, "invalid_session", "Sessão expirada. Faça login novamente.");
    try {
      const { user, session } = await auth.refresh(raw, { ip: req.ip, userAgent: req.get("user-agent") });
      setAuthCookies(res, session.access, session.refresh);
      res.json({ user, permissions: permissionsOf(user.role) });
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(res);
    res.status(204).end();
  }),
);

authRouter.get("/me", authenticate, (req, res) => {
  const u = req.user!;
  res.json({
    user: { id: u.id, email: u.email, name: u.name, role: u.role },
    permissions: permissionsOf(u.role),
  });
});

authRouter.post("/forgot-password", authTokenLimiter, asyncHandler(async (req, res) => {
  await auth.forgotPassword(forgotPasswordSchema.parse(req.body).email);
  res.status(204).end();
}));

authRouter.post("/reset-password", authTokenLimiter, asyncHandler(async (req, res) => {
  const i = resetPasswordSchema.parse(req.body);
  await auth.resetPassword(i.token, i.password);
  clearAuthCookies(res);
  res.status(204).end();
}));

authRouter.post("/verify-email", authTokenLimiter, asyncHandler(async (req, res) => {
  await auth.verifyEmail(verifyEmailSchema.parse(req.body).token);
  res.status(204).end();
}));

authRouter.post("/resend-verification", authTokenLimiter, authenticate, asyncHandler(async (req, res) => {
  await auth.resendVerification(req.user!.id);
  res.status(204).end();
}));
