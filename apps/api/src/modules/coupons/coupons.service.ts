import type { Queryable } from "../../db/pool";
import { AppError } from "../../middleware/errors";

export type CouponRow = {
  id: string; code: string; type: "percent" | "fixed" | "free_shipping"; value: number;
  min_subtotal_cents: number; max_discount_cents: number | null; starts_at: Date | null; ends_at: Date | null;
  usage_limit: number | null; per_customer_limit: number | null; used_count: number; is_active: boolean;
};

export type CouponResult = { coupon: CouponRow; discountCents: number; shippingDiscountCents: number };

const fail = (code: string, message: string) => new AppError(422, code, message);

/**
 * Valida e calcula o desconto. Com `lock`, trava a linha do cupom (use dentro da transação do pedido)
 * para que o limite de usos não seja ultrapassado por pedidos simultâneos.
 */
export async function evaluateCoupon(
  db: Queryable,
  code: string,
  ctx: { subtotalCents: number; shippingCents: number; email?: string | undefined; userId?: string | undefined },
  lock = false,
): Promise<CouponResult> {
  const { rows } = await db.query<CouponRow>(
    `SELECT id, code::text AS code, type, value, min_subtotal_cents, max_discount_cents, starts_at, ends_at,
            usage_limit, per_customer_limit, used_count, is_active
       FROM coupons WHERE code = $1 ${lock ? "FOR UPDATE" : ""}`,
    [code],
  );
  const c = rows[0];
  const now = new Date();
  if (!c || !c.is_active) throw fail("coupon_invalid", "Cupom inválido.");
  if ((c.starts_at && c.starts_at > now) || (c.ends_at && c.ends_at < now)) throw fail("coupon_expired", "Cupom fora do prazo de validade.");
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) throw fail("coupon_exhausted", "Este cupom já atingiu o limite de usos.");
  if (ctx.subtotalCents < c.min_subtotal_cents) throw fail("coupon_min_subtotal", "O valor mínimo do pedido para este cupom não foi atingido.");

  if (c.per_customer_limit !== null && (ctx.email || ctx.userId)) {
    const used = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1 AND (customer_email = $2 OR ($3::uuid IS NOT NULL AND user_id = $3))`,
      [c.id, ctx.email ?? "", ctx.userId ?? null],
    );
    if ((used.rows[0]?.n ?? 0) >= c.per_customer_limit) throw fail("coupon_customer_limit", "Você já usou este cupom o número máximo de vezes.");
  }

  let discountCents = 0;
  let shippingDiscountCents = 0;
  if (c.type === "percent") {
    discountCents = Math.floor((ctx.subtotalCents * c.value) / 100);
    if (c.max_discount_cents !== null) discountCents = Math.min(discountCents, c.max_discount_cents);
  } else if (c.type === "fixed") {
    discountCents = Math.min(c.value, ctx.subtotalCents);
  } else {
    shippingDiscountCents = ctx.shippingCents;
  }
  return { coupon: c, discountCents, shippingDiscountCents };
}
