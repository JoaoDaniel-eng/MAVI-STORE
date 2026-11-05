import { hasPermission, type Permission } from "@mavi/shared";
import type { RequestHandler } from "express";
import { ACCESS_COOKIE } from "../lib/cookies";
import { verifyAccess } from "../lib/tokens";
import { AppError } from "./errors";
import { asyncHandler } from "../lib/async";
import { findById } from "../modules/users/users.repo";
import { pool } from "../db/pool";

/** Valida o cookie de acesso e recarrega o usuário (papel e status sempre atuais). */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  const claims = token ? verifyAccess(token) : null;
  if (!claims) throw new AppError(401, "unauthenticated", "Faça login para continuar.");

  const user = await findById(pool, claims.sub);
  if (!user || !user.is_active) throw new AppError(401, "unauthenticated", "Faça login para continuar.");

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
});

export const requirePermission =
  (...needed: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, "unauthenticated", "Faça login para continuar."));
    const role = req.user.role;
    if (!needed.every((p) => hasPermission(role, p))) {
      return next(new AppError(403, "forbidden", "Você não tem permissão para esta ação."));
    }
    next();
  };

/**
 * Proteção CSRF para rotas com cookie: exige um cabeçalho customizado nas escritas.
 * Navegadores só o enviam em requisições cross-origin após preflight, que o CORS bloqueia
 * para origens fora de CORS_ORIGIN.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "mavi") {
    return next(new AppError(403, "csrf", "Requisição não autorizada."));
  }
  next();
};

/** Identifica a cliente se houver sessão válida, mas deixa visitantes passarem (checkout sem conta). */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  const claims = token ? verifyAccess(token) : null;
  if (claims) {
    const user = await findById(pool, claims.sub);
    if (user && user.is_active) req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  }
  next();
});
