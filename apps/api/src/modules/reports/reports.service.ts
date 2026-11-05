import { pool } from "../../db/pool";
import { resolveRange, toCsv } from "../../lib/csv";
import { AppError } from "../../middleware/errors";

export { resolveRange };

const TZ = "America/Sao_Paulo";

const reais = (c: unknown) => (c === null || c === undefined ? "" : Number(c) / 100);
const LIMIT = 50_000;

const RANGE = `o.created_at >= ($1::date::timestamp AT TIME ZONE '${TZ}') AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')`;

export async function buildReport(type: string, from: string, to: string): Promise<string> {
  switch (type) {
    case "sales": {
      const { rows } = await pool.query(
        `SELECT o.order_number, o.created_at, o.status, o.payment_method, o.payment_status, o.fulfillment, l.code AS origin, o.customer_name,
                o.customer_email::text AS email, o.subtotal_cents, o.discount_cents, o.shipping_cents, o.shipping_discount_cents, o.total_cents, o.coupon_code
           FROM orders o JOIN locations l ON l.id = o.origin_location_id WHERE ${RANGE} ORDER BY o.created_at LIMIT ${LIMIT}`, [from, to]);
      return toCsv(["Pedido", "Data", "Status", "Forma de pagamento", "Situação do pagamento", "Tipo", "Unidade", "Cliente", "E-mail", "Subtotal (R$)", "Desconto (R$)", "Frete (R$)", "Desconto no frete (R$)", "Total (R$)", "Cupom"],
        rows.map((r) => [r.order_number, r.created_at, r.status, r.payment_method, r.payment_status, r.fulfillment, r.origin, r.customer_name, r.email,
          reais(r.subtotal_cents), reais(r.discount_cents), reais(r.shipping_cents), reais(r.shipping_discount_cents), reais(r.total_cents), r.coupon_code]));
    }
    case "items": {
      const { rows } = await pool.query(
        `SELECT o.order_number, o.created_at, o.status, oi.product_name, oi.sku_code, oi.color_name, oi.size_label, oi.quantity, oi.unit_price_cents, oi.total_cents, l.code AS origin
           FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN locations l ON l.id = o.origin_location_id WHERE ${RANGE} ORDER BY o.created_at, oi.product_name LIMIT ${LIMIT}`, [from, to]);
      return toCsv(["Pedido", "Data", "Status", "Produto", "SKU", "Cor", "Tamanho", "Quantidade", "Preço unitário (R$)", "Total (R$)", "Unidade"],
        rows.map((r) => [r.order_number, r.created_at, r.status, r.product_name, r.sku_code, r.color_name, r.size_label, r.quantity, reais(r.unit_price_cents), reais(r.total_cents), r.origin]));
    }
    case "stock": {
      const { rows } = await pool.query(
        `SELECT p.name, s.sku_code, col.name AS color, z.label AS size, l.code AS location, COALESCE(sl.on_hand, 0) AS on_hand, COALESCE(sl.reserved, 0) AS reserved, s.is_active
           FROM skus s JOIN products p ON p.id = s.product_id JOIN colors col ON col.id = s.color_id JOIN sizes z ON z.id = s.size_id
           CROSS JOIN locations l LEFT JOIN stock_levels sl ON sl.sku_id = s.id AND sl.location_id = l.id
          WHERE l.is_active AND p.status <> 'archived' ORDER BY p.name, col.name, z.sort_order, l.sort_order LIMIT ${LIMIT}`);
      return toCsv(["Produto", "SKU", "Cor", "Tamanho", "Unidade", "Físico", "Reservado", "Disponível", "SKU ativo"],
        rows.map((r) => [r.name, r.sku_code, r.color, r.size, r.location, r.on_hand, r.reserved, r.on_hand - r.reserved, r.is_active ? "sim" : "não"]));
    }
    case "coupons": {
      const { rows } = await pool.query(
        `SELECT c.code::text AS code, o.order_number, o.created_at, o.status, r.customer_email::text AS email, o.discount_cents, o.shipping_discount_cents
           FROM coupon_redemptions r JOIN coupons c ON c.id = r.coupon_id JOIN orders o ON o.id = r.order_id WHERE ${RANGE} ORDER BY o.created_at LIMIT ${LIMIT}`, [from, to]);
      return toCsv(["Cupom", "Pedido", "Data", "Status do pedido", "E-mail", "Desconto (R$)", "Desconto no frete (R$)"],
        rows.map((r) => [r.code, r.order_number, r.created_at, r.status, r.email, reais(r.discount_cents), reais(r.shipping_discount_cents)]));
    }
    case "customers": {
      const { rows } = await pool.query(
        `SELECT customer_email::text AS email, max(customer_name) AS name, max(customer_phone) AS phone,
                count(*) FILTER (WHERE o.status NOT IN ('awaiting_payment','cancelled'))::int AS orders,
                COALESCE(sum(total_cents) FILTER (WHERE o.status NOT IN ('awaiting_payment','cancelled')), 0)::bigint AS total, max(created_at) AS last_order
           FROM orders o WHERE ${RANGE} GROUP BY 1 ORDER BY total DESC LIMIT ${LIMIT}`, [from, to]);
      return toCsv(["E-mail", "Nome", "Telefone", "Pedidos confirmados", "Total gasto (R$)", "Último pedido"],
        rows.map((r) => [r.email, r.name, r.phone, r.orders, reais(r.total), r.last_order]));
    }
    default:
      throw new AppError(404, "not_found", "Relatório não encontrado.");
  }
}
