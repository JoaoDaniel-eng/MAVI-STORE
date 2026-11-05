import type { ReviewsResponse } from "@mavi/shared";
import { pool, withTransaction } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";
import { camel, type Row } from "../catalog/crud";
import { findById } from "../users/users.repo";

async function productIdBySlug(slug: string): Promise<string> {
  const r = (await pool.query<{ id: string }>(`SELECT id FROM products WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
  if (!r) throw new AppError(404, "not_found", "Produto não encontrado.");
  return r.id;
}

/** Só quem recebeu o produto (pedido entregue) pode avaliar, uma vez por produto. */
async function eligibility(userId: string, productId: string): Promise<{ purchased: boolean; already: boolean }> {
  const u = (await findById(pool, userId))!;
  const bought = await pool.query(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN skus s ON s.id = oi.sku_id
      WHERE s.product_id = $1 AND o.status = 'delivered' AND (o.user_id = $2 OR ($3::boolean AND o.customer_email = $4)) LIMIT 1`,
    [productId, userId, u.email_verified_at !== null, u.email],
  );
  const done = await pool.query(`SELECT 1 FROM reviews WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
  return { purchased: !!bought.rowCount, already: !!done.rowCount };
}

export async function listReviews(slug: string, q: { limit: number; offset: number }, userId?: string): Promise<ReviewsResponse> {
  const productId = await productIdBySlug(slug);
  const [sum, list, elig] = await Promise.all([
    pool.query<Row>(
      `SELECT count(*)::int AS n, avg(rating)::float AS avg,
              count(*) FILTER (WHERE rating = 1)::int AS r1, count(*) FILTER (WHERE rating = 2)::int AS r2,
              count(*) FILTER (WHERE rating = 3)::int AS r3, count(*) FILTER (WHERE rating = 4)::int AS r4,
              count(*) FILTER (WHERE rating = 5)::int AS r5
         FROM reviews WHERE product_id = $1 AND status = 'approved'`, [productId]),
    pool.query<Row>(
      `SELECT id, rating, title, body, author_name, created_at FROM reviews
        WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [productId, q.limit, q.offset]),
    userId ? eligibility(userId, productId) : Promise.resolve(null),
  ]);
  const s = sum.rows[0]!;
  const n = s["n"] as number;
  return {
    summary: {
      average: n > 0 ? Math.round((s["avg"] as number) * 10) / 10 : null, count: n,
      distribution: [s["r1"], s["r2"], s["r3"], s["r4"], s["r5"]] as ReviewsResponse["summary"]["distribution"],
    },
    items: list.rows.map((r) => ({
      id: r["id"] as string, rating: r["rating"] as number, title: (r["title"] as string | null) ?? null,
      body: r["body"] as string, authorName: r["author_name"] as string, createdAt: (r["created_at"] as Date).toISOString(),
    })),
    total: n,
    canReview: elig ? elig.purchased && !elig.already : null,
  };
}

export async function createReview(slug: string, input: { rating: number; title?: string | undefined; body: string }, userId: string) {
  const productId = await productIdBySlug(slug);
  const el = await eligibility(userId, productId);
  if (!el.purchased) throw new AppError(403, "not_purchased", "Só quem recebeu o produto pode avaliar.");
  if (el.already) throw new AppError(409, "already_reviewed", "Você já avaliou este produto.");
  const u = (await findById(pool, userId))!;
  const parts = u.name.trim().split(/\s+/);
  const author = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0]!;
  await pool.query(
    `INSERT INTO reviews (product_id, user_id, rating, title, body, author_name) VALUES ($1,$2,$3,$4,$5,$6)`,
    [productId, userId, input.rating, input.title || null, input.body, author],
  );
}

export async function adminListReviews(q: { status?: string | undefined; limit: number; offset: number }) {
  const params: unknown[] = [];
  let where = "";
  if (q.status) { params.push(q.status); where = "WHERE r.status = $1"; }
  params.push(q.limit, q.offset);
  const { rows } = await pool.query<Row>(
    `SELECT r.id, r.rating, r.title, r.body, r.author_name, r.status, r.moderation_note, r.created_at, r.moderated_at,
            p.name AS product_name, p.slug AS product_slug, count(*) OVER() AS total
       FROM reviews r JOIN products p ON p.id = r.product_id ${where}
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { total: rows[0] ? Number(rows[0]["total"]) : 0, items: rows.map((r) => { const { total: _t, ...rest } = camel(r); return rest; }) };
}

export async function moderateReview(id: string, input: { status: "approved" | "rejected"; note?: string | undefined }, actorId: string, ctx: AuditCtx) {
  return withTransaction(async (c) => {
    const before = (await c.query<Row>(`SELECT status FROM reviews WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!before) throw new AppError(404, "not_found", "Avaliação não encontrada.");
    await c.query(
      `UPDATE reviews SET status = $2, moderation_note = $3, moderated_by = $4, moderated_at = now() WHERE id = $1`,
      [id, input.status, input.note ?? null, actorId],
    );
    await writeAudit(c, ctx, { action: "review.moderate", entity: "review", entityId: id, before: { status: before["status"] }, after: { status: input.status, note: input.note } });
    return { id, status: input.status };
  });
}
