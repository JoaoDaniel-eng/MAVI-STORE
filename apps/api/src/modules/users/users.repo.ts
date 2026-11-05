import type { PublicUser, Role } from "@mavi/shared";
import type { Queryable } from "../../db/pool";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  email_verified_at: Date | null;
  created_at: Date;
};

export const COLS =
  "id, email, password_hash, name, phone, role, is_active, failed_login_count, locked_until, email_verified_at, created_at";
export const PUBLIC_COLS = "id, email, name, phone, role, is_active, created_at";

export const toPublic = (
  u: Pick<UserRow, "id" | "email" | "name" | "phone" | "role" | "is_active" | "created_at">,
): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  role: u.role,
  isActive: u.is_active,
  createdAt: u.created_at.toISOString(),
});

export async function findById(db: Queryable, id: string): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>(`SELECT ${COLS} FROM users WHERE id = $1`, [id]);
  return rows[0];
}

export async function findByEmail(db: Queryable, email: string): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>(`SELECT ${COLS} FROM users WHERE email = $1`, [email]);
  return rows[0];
}
