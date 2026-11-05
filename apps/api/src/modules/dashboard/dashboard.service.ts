import type { DashboardData } from "@mavi/shared";
import { getIntegrationStatus } from "../../config/integrations";
import { pool } from "../../db/pool";

const TZ = "America/Sao_Paulo";
const OK = `status NOT IN ('awaiting_payment','cancelled')`; // "vendas confirmadas"
const n = (v: unknown) => Number(v ?? 0);

export async function getDashboard(days: number): Promise<DashboardData> {
  // Início do período no fuso da loja (dias corridos, incluindo hoje).
  const start = `(((now() AT TIME ZONE '${TZ}')::date - ($1::int - 1))::timestamp AT TIME ZONE '${TZ}')`;
  const [sum, series, top, loc, method, todo, low, mail] = await Promise.all([
    pool.query(`SELECT count(*) FILTER (WHERE ${OK})::int AS orders, COALESCE(sum(total_cents) FILTER (WHERE ${OK}), 0)::bigint AS revenue,
                       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled, count(*) FILTER (WHERE status = 'awaiting_payment')::int AS awaiting
                  FROM orders WHERE created_at >= ${start}`, [days]),
    pool.query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(x.orders, 0)::int AS orders, COALESCE(x.revenue, 0)::bigint AS revenue
                  FROM generate_series(((now() AT TIME ZONE '${TZ}')::date - ($1::int - 1)), (now() AT TIME ZONE '${TZ}')::date, interval '1 day') d
                  LEFT JOIN (SELECT (created_at AT TIME ZONE '${TZ}')::date AS day, count(*) AS orders, sum(total_cents) AS revenue
                               FROM orders WHERE created_at >= ${start} AND ${OK} GROUP BY 1) x ON x.day = d::date
                 ORDER BY d`, [days]),
    pool.query(`SELECT oi.product_name AS name, sum(oi.quantity)::int AS units, sum(oi.total_cents)::bigint AS revenue
                  FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.created_at >= ${start} AND o.${OK}
                 GROUP BY oi.product_name ORDER BY units DESC, revenue DESC LIMIT 8`, [days]),
    pool.query(`SELECT l.code, count(*)::int AS orders, COALESCE(sum(o.total_cents), 0)::bigint AS revenue
                  FROM orders o JOIN locations l ON l.id = o.origin_location_id WHERE o.created_at >= ${start} AND o.${OK} GROUP BY l.code ORDER BY l.code`, [days]),
    pool.query(`SELECT payment_method AS method, count(*)::int AS orders FROM orders WHERE created_at >= ${start} AND ${OK} GROUP BY 1 ORDER BY 2 DESC`, [days]),
    pool.query(`SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS to_process, count(*) FILTER (WHERE status = 'processing')::int AS processing,
                       count(*) FILTER (WHERE status = 'ready_for_pickup')::int AS ready, count(*) FILTER (WHERE requires_refund)::int AS refunds,
                       (SELECT count(*) FROM reviews WHERE status = 'pending')::int AS reviews FROM orders`),
    pool.query(`WITH thr AS (SELECT COALESCE((SELECT (value->>'default')::int FROM settings WHERE key = 'stock.low_stock_threshold'), 3) AS d)
                SELECT count(*)::int AS n FROM skus s JOIN products p ON p.id = s.product_id CROSS JOIN locations l CROSS JOIN thr
                  LEFT JOIN stock_levels sl ON sl.sku_id = s.id AND sl.location_id = l.id
                 WHERE s.is_active AND p.status = 'active' AND l.is_active
                   AND COALESCE(sl.on_hand, 0) - COALESCE(sl.reserved, 0) <= COALESCE(sl.low_stock_threshold, thr.d)`),
    pool.query(`SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*) FILTER (WHERE status = 'failed')::int AS failed FROM email_outbox`),
  ]);

  const s = sum.rows[0]!;
  const orders = n(s.orders);
  const revenue = n(s.revenue);
  return {
    days,
    summary: { orders, revenueCents: revenue, averageTicketCents: orders ? Math.round(revenue / orders) : 0, cancelled: n(s.cancelled), awaitingPayment: n(s.awaiting) },
    series: series.rows.map((r) => ({ day: String(r.day), orders: n(r.orders), revenueCents: n(r.revenue) })),
    topProducts: top.rows.map((r) => ({ name: r.name as string, units: n(r.units), revenueCents: n(r.revenue) })),
    byLocation: loc.rows.map((r) => ({ code: r.code as string, orders: n(r.orders), revenueCents: n(r.revenue) })),
    byMethod: method.rows.map((r) => ({ method: r.method as string, orders: n(r.orders) })),
    todo: {
      toProcess: n(todo.rows[0]!.to_process), processing: n(todo.rows[0]!.processing), readyForPickup: n(todo.rows[0]!.ready),
      refundsPending: n(todo.rows[0]!.refunds), reviewsPending: n(todo.rows[0]!.reviews), lowStock: n(low.rows[0]!.n),
      emailsPending: n(mail.rows[0]!.pending), emailsFailed: n(mail.rows[0]!.failed),
    },
    integrations: getIntegrationStatus(),
  };
}

export async function listCustomers(q: { q?: string | undefined; limit: number; offset: number }) {
  const params: unknown[] = [];
  let where = "";
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
    where = `WHERE (COALESCE(u.name, o.name) ILIKE $1 OR COALESCE(o.email, u.email::text) ILIKE $1)`;
  }
  params.push(q.limit, q.offset);
  const { rows } = await pool.query(
    `WITH o AS (
       SELECT customer_email::text AS email, max(customer_name) AS name, max(customer_phone) AS phone,
              count(*) FILTER (WHERE ${OK})::int AS orders,
              COALESCE(sum(total_cents) FILTER (WHERE ${OK}), 0)::bigint AS total, max(created_at) AS last_order
         FROM orders GROUP BY 1)
     SELECT COALESCE(o.email, u.email::text) AS email, COALESCE(u.name, o.name) AS name, COALESCE(u.phone, o.phone) AS phone,
            COALESCE(o.orders, 0) AS orders, COALESCE(o.total, 0) AS total, o.last_order,
            u.id AS user_id, u.is_active, u.email_verified_at, u.created_at AS registered_at, count(*) OVER() AS rows_total
       FROM o FULL JOIN (SELECT * FROM users WHERE role = 'customer') u ON u.email::text = o.email
       ${where}
      ORDER BY COALESCE(o.last_order, u.created_at) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? n(rows[0].rows_total) : 0,
    items: rows.map((r) => ({
      email: r.email as string, name: r.name as string, phone: (r.phone as string | null) ?? null, orders: n(r.orders), totalCents: n(r.total),
      lastOrderAt: r.last_order ? (r.last_order as Date).toISOString() : null, userId: (r.user_id as string | null) ?? null,
      hasAccount: r.user_id !== null, isActive: r.user_id ? (r.is_active as boolean) : null,
      emailVerified: r.user_id ? r.email_verified_at !== null : null,
      registeredAt: r.registered_at ? (r.registered_at as Date).toISOString() : null,
    })),
  };
}
