import type { PickupOption, ShippingQuote } from "@mavi/shared";
import { pool } from "../../db/pool";
import { melhorEnvioReady, quoteMelhorEnvio } from "../../lib/melhorEnvio";
import { AppError } from "../../middleware/errors";
import { pickShippingOrigin } from "../stock/origin.service";
import { mergeItems, priceItems } from "./pricing.service";

type Item = { skuId: string; quantity: number };
const unavailable = (reason: NonNullable<ShippingQuote["shipping"]["reason"]>): ShippingQuote["shipping"] => ({
  available: false, reason, message: "Cotação indisponível.", options: [],
});

/** Unidades de retirada que têm TODOS os itens em estoque. */
export async function pickupOptions(items: Item[]): Promise<PickupOption[]> {
  const merged = mergeItems(items);
  const locs = (await pool.query(
    `SELECT id, code, name, shopping_name, pickup_fee_cents FROM locations WHERE is_active AND pickup_enabled ORDER BY sort_order`,
  )).rows;
  const stock = (await pool.query<{ location_id: string; sku_id: string; available: number }>(
    `SELECT location_id, sku_id, on_hand - reserved AS available FROM stock_levels WHERE sku_id = ANY($1::uuid[])`,
    [merged.map((i) => i.skuId)],
  )).rows;
  const avail = new Map(stock.map((s) => [`${s.location_id}:${s.sku_id}`, s.available]));
  return locs.map((l) => ({
    code: l.code, name: l.name, shoppingName: l.shopping_name, feeCents: l.pickup_fee_cents,
    available: merged.every((i) => (avail.get(`${l.id}:${i.skuId}`) ?? 0) >= i.quantity),
  }));
}

/** Cotação de entrega: unidade de origem pela regra configurada + Melhor Envio (apenas backend). */
export async function quoteShipping(items: Item[], postalCode: string) {
  if (!melhorEnvioReady()) return { shipping: unavailable("credentials_pending"), origin: null };

  let origin;
  try {
    origin = await pickShippingOrigin(pool, items);
  } catch (e) {
    if (e instanceof AppError && e.code === "insufficient_stock") return { shipping: unavailable("no_stock"), origin: null };
    throw e;
  }
  const loc = (await pool.query<{ postal_code: string | null }>(`SELECT postal_code FROM locations WHERE id = $1`, [origin.id])).rows[0];
  if (!loc?.postal_code) return { shipping: unavailable("origin_postal_code_pending"), origin };

  const lines = await priceItems(pool, items);
  const dims = (await pool.query(
    `SELECT s.id, p.weight_g, p.length_cm, p.width_cm, p.height_cm FROM skus s JOIN products p ON p.id = s.product_id WHERE s.id = ANY($1::uuid[])`,
    [lines.map((l) => l.skuId)],
  )).rows;
  const byId = new Map(dims.map((d) => [d.id as string, d]));

  const products = [];
  for (const l of lines) {
    const d = byId.get(l.skuId);
    if (!d || !d.weight_g || !d.length_cm || !d.width_cm || !d.height_cm) return { shipping: unavailable("service_error"), origin }; // sem peso/medidas não se cota
    products.push({
      id: l.skuCode ?? l.skuId, widthCm: d.width_cm, heightCm: d.height_cm, lengthCm: d.length_cm,
      weightKg: d.weight_g / 1000, insuranceValue: l.unitPriceCents / 100, quantity: l.quantity,
    });
  }

  const r = await quoteMelhorEnvio({ fromCep: loc.postal_code, toCep: postalCode, products });
  const info = { code: origin.code, name: origin.code };
  if (!r.ok) return { shipping: unavailable(r.reason), origin };
  if (!r.services.length) return { shipping: unavailable("no_options"), origin };
  return { shipping: { available: true, origin: info, options: r.services } as ShippingQuote["shipping"], origin };
}

export async function shippingQuoteResponse(items: Item[], postalCode: string): Promise<ShippingQuote> {
  const [s, pickup] = await Promise.all([quoteShipping(items, postalCode), pickupOptions(items)]);
  return { shipping: s.shipping, pickup };
}
