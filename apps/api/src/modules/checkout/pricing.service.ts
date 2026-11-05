import { MAX_LINE_QTY, type PricedLine } from "@mavi/shared";
import type { Queryable } from "../../db/pool";

type Item = { skuId: string; quantity: number };

export function mergeItems(items: Item[]): Item[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.skuId, Math.min(MAX_LINE_QTY, (m.get(i.skuId) ?? 0) + i.quantity));
  return [...m].map(([skuId, quantity]) => ({ skuId, quantity }));
}

/** Preços e disponibilidade sempre vêm do banco; o cliente só informa SKU e quantidade. */
export async function priceItems(db: Queryable, items: Item[]): Promise<PricedLine[]> {
  const merged = mergeItems(items);
  const { rows } = await db.query(
    `SELECT s.id, s.sku_code, s.is_active AS sku_active, p.id AS product_id, p.name, p.slug, p.status,
            COALESCE(s.price_cents, p.base_price_cents) AS unit_price_cents,
            col.name AS color_name, z.label AS size_label,
            COALESCE(
              (SELECT i.url FROM product_images i WHERE i.product_id = p.id AND i.color_id = s.color_id ORDER BY i.sort_order, i.created_at LIMIT 1),
              (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1)
            ) AS image_url,
            COALESCE((SELECT sum(sl.on_hand - sl.reserved) FROM stock_levels sl JOIN locations l ON l.id = sl.location_id
                       WHERE sl.sku_id = s.id AND l.is_active), 0)::int AS available
       FROM skus s JOIN products p ON p.id = s.product_id
       JOIN colors col ON col.id = s.color_id JOIN sizes z ON z.id = s.size_id
      WHERE s.id = ANY($1::uuid[])`,
    [merged.map((i) => i.skuId)],
  );
  const by = new Map(rows.map((r) => [r.id as string, r]));

  return merged.map((it): PricedLine => {
    const r = by.get(it.skuId);
    if (!r) {
      return { skuId: it.skuId, productId: null, productName: "Item indisponível", slug: null, skuCode: null, colorName: null,
        sizeLabel: null, imageUrl: null, unitPriceCents: 0, quantity: it.quantity, lineTotalCents: 0, available: 0, problem: "unavailable" };
    }
    const sellable = r.sku_active && r.status === "active";
    const available = r.available as number;
    const unit = r.unit_price_cents as number;
    return {
      skuId: it.skuId, productId: r.product_id, productName: r.name, slug: r.slug, skuCode: r.sku_code,
      colorName: r.color_name, sizeLabel: r.size_label, imageUrl: r.image_url ?? null,
      unitPriceCents: unit, quantity: it.quantity, lineTotalCents: unit * it.quantity, available,
      problem: !sellable ? "unavailable" : available < it.quantity ? "insufficient_stock" : null,
    };
  });
}

export const subtotalOf = (lines: PricedLine[]) => lines.reduce((n, l) => n + l.lineTotalCents, 0);
