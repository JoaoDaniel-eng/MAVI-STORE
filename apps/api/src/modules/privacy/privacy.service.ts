import crypto from "node:crypto";
import { env } from "../../config/env";
import { pool, withTransaction } from "../../db/pool";
import { hashPassword } from "../../lib/passwords";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";

type R = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);

/** Cópia dos dados pessoais de uma pessoa (por e-mail): conta, pedidos, favoritos e avaliações. */
export async function exportPersonalData(email: string) {
  const user = (await pool.query<R>(
    `SELECT id, email::text AS email, name, phone, role, marketing_opt_in, email_verified_at, terms_accepted_at, created_at, last_login_at
       FROM users WHERE email = $1`, [email])).rows[0];
  const orders = (await pool.query<R>(
    `SELECT id, order_number, created_at, status, payment_method, payment_status, fulfillment, customer_name, customer_email::text AS customer_email,
            customer_phone, customer_document, shipping_address, subtotal_cents, discount_cents, shipping_cents, total_cents, coupon_code, notes
       FROM orders WHERE customer_email = $1 OR ($2::uuid IS NOT NULL AND user_id = $2) ORDER BY created_at`, [email, user?.["id"] ?? null])).rows;
  const items = orders.length
    ? (await pool.query<R>(`SELECT order_id, product_name, sku_code, color_name, size_label, quantity, unit_price_cents, total_cents FROM order_items WHERE order_id = ANY($1::uuid[])`, [orders.map((o) => o["id"])])).rows
    : [];
  const favorites = user ? (await pool.query<R>(`SELECT p.name, f.created_at FROM favorites f JOIN products p ON p.id = f.product_id WHERE f.user_id = $1`, [user["id"]])).rows : [];
  const reviews = user ? (await pool.query<R>(`SELECT p.name AS product, r.rating, r.title, r.body, r.status, r.created_at FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.user_id = $1`, [user["id"]])).rows : [];

  return {
    geradoEm: new Date().toISOString(),
    observacao: "Pedidos podem ser mantidos pela loja pelo prazo exigido em lei (obrigações fiscais), mesmo após a exclusão da conta.",
    conta: user ? { email: user["email"], nome: user["name"], telefone: user["phone"], recebeNovidades: user["marketing_opt_in"], emailConfirmadoEm: iso(user["email_verified_at"]), termosAceitosEm: iso(user["terms_accepted_at"]), criadaEm: iso(user["created_at"]), ultimoAcessoEm: iso(user["last_login_at"]) } : null,
    pedidos: orders.map((o) => ({
      numero: Number(o["order_number"]), data: iso(o["created_at"]), status: o["status"], pagamento: { forma: o["payment_method"], situacao: o["payment_status"] }, entrega: o["fulfillment"],
      cliente: { nome: o["customer_name"], email: o["customer_email"], telefone: o["customer_phone"], cpf: o["customer_document"] }, endereco: o["shipping_address"],
      valores: { subtotalCentavos: o["subtotal_cents"], descontoCentavos: o["discount_cents"], freteCentavos: o["shipping_cents"], totalCentavos: o["total_cents"] }, cupom: o["coupon_code"], observacoes: o["notes"],
      itens: items.filter((i) => i["order_id"] === o["id"]).map((i) => ({ produto: i["product_name"], sku: i["sku_code"], cor: i["color_name"], tamanho: i["size_label"], quantidade: i["quantity"], precoUnitarioCentavos: i["unit_price_cents"] })),
    })),
    favoritos: favorites.map((f) => ({ produto: f["name"], em: iso(f["created_at"]) })),
    avaliacoes: reviews.map((r) => ({ produto: r["product"], nota: r["rating"], titulo: r["title"], texto: r["body"], status: r["status"], em: iso(r["created_at"]) })),
  };
}

/**
 * Exclusão de conta: anonimiza o cadastro e apaga favoritos, avaliações, tokens e e-mails na fila.
 * Os pedidos permanecem (obrigação legal/fiscal), desvinculados da conta, até o job de retenção anonimizá-los.
 */
export async function anonymizeAccount(userId: string, ctx: AuditCtx) {
  const randomHash = await hashPassword(crypto.randomBytes(24).toString("base64url"));
  await withTransaction(async (c) => {
    const u = (await c.query<{ id: string; email: string; role: string }>(`SELECT id, email::text AS email, role FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!u) throw new AppError(404, "not_found", "Conta não encontrada.");
    if (u.role !== "customer") throw new AppError(403, "forbidden", "Contas da equipe não são excluídas por aqui.");

    await c.query(`DELETE FROM email_outbox WHERE to_email = $1`, [u.email]);
    await c.query(`DELETE FROM favorites WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM reviews WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM auth_tokens WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
    await c.query(`UPDATE orders SET user_id = NULL WHERE user_id = $1`, [userId]);
    await c.query(
      `UPDATE users SET email = $2, name = 'Conta excluída', phone = NULL, password_hash = $3, is_active = false, marketing_opt_in = false,
              email_verified_at = NULL, last_login_at = NULL, deleted_at = now() WHERE id = $1`,
      [userId, `deleted-${userId}@anon.invalid`, randomHash],
    );
    await writeAudit(c, ctx, { action: "privacy.anonymize_account", entity: "user", entityId: userId }); // sem dados pessoais no registro
  });
}

/** Retenção: depois do prazo, remove dados pessoais de pedidos já encerrados (mantém valores e itens para contabilidade). */
export async function anonymizeOldOrders(years = env.ORDER_RETENTION_YEARS): Promise<number> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `UPDATE orders SET customer_name = 'Cliente anonimizado', customer_email = 'anon-' || id::text || '@anon.invalid', customer_phone = '',
              customer_document = '', shipping_address = CASE WHEN shipping_address IS NULL THEN NULL ELSE jsonb_build_object('city', shipping_address->'city', 'state', shipping_address->'state') END,
              notes = NULL, user_id = NULL
        WHERE status IN ('delivered','cancelled') AND created_at < now() - make_interval(years => $1::int)
          AND customer_email NOT LIKE '%@anon.invalid' RETURNING id`, [years]);
    if (rows.length) {
      await c.query(`UPDATE coupon_redemptions r SET customer_email = 'anon-' || r.order_id::text || '@anon.invalid', user_id = NULL WHERE r.order_id = ANY($1::uuid[])`, [rows.map((r) => r.id)]);
    }
    return rows.length;
  });
}
