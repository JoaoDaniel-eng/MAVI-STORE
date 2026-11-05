import crypto from "node:crypto";
import type { Role } from "@mavi/shared";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AccessClaims = { sub: string; role: Role };

export const signAccess = (c: AccessClaims) =>
  jwt.sign({ role: c.role }, env.JWT_ACCESS_SECRET, {
    subject: c.sub,
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60,
  });

export function verifyAccess(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof p === "string" || !p.sub) return null;
    return { sub: p.sub, role: p["role"] as Role };
  } catch {
    return null;
  }
}

/** Token opaco; só o hash SHA-256 é guardado no banco. */
export const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
