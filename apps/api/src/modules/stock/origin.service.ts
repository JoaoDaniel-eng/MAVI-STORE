import type { Queryable } from "../../db/pool";
import { AppError } from "../../middleware/errors";
import { getSetting } from "../settings/settings.service";
import type { ReserveItem } from "./reservations.service";

type Loc = { id: string; code: string; sort_order: number };

/**
 * Escolhe a unidade de saída da entrega nacional conforme `shipping.origin_rule`.
 * Considera só unidades que têm TODOS os itens (sem envio dividido). A disponibilidade pode mudar
 * antes da reserva; quem chama deve reservar na unidade escolhida e tratar o 409 se falhar.
 */
export async function pickShippingOrigin(db: Queryable, items: ReserveItem[]): Promise<Loc> {
  const rule = await getSetting(db, "shipping.origin_rule");
  const locs = (
    await db.query<Loc>(
      `SELECT id, code, sort_order FROM locations WHERE is_active AND can_ship_from ORDER BY sort_order`,
    )
  ).rows;

  const need = new Map<string, number>();
  for (const i of items) need.set(i.skuId, (need.get(i.skuId) ?? 0) + i.quantity);

  const { rows } = await db.query<{ location_id: string; sku_id: string; available: number }>(
    `SELECT location_id, sku_id, on_hand - reserved AS available FROM stock_levels
      WHERE sku_id = ANY($1::uuid[]) AND location_id = ANY($2::uuid[])`,
    [[...need.keys()], locs.map((l) => l.id)],
  );
  const avail = new Map(rows.map((r) => [`${r.location_id}:${r.sku_id}`, r.available]));
  const has = (l: Loc) => [...need].every(([sku, q]) => (avail.get(`${l.id}:${sku}`) ?? 0) >= q);
  const total = (l: Loc) => [...need.keys()].reduce((n, sku) => n + (avail.get(`${l.id}:${sku}`) ?? 0), 0);

  const candidates = locs.filter(has);
  const unavailable = () => new AppError(409, "insufficient_stock", "Nenhuma unidade de envio tem todos os itens em estoque.");
  if (!candidates.length) throw unavailable();

  const def = candidates.find((l) => l.code === rule.default_location_code);
  if (rule.strategy === "default_only") {
    if (!def) throw unavailable();
    return def;
  }
  if (rule.strategy === "default_with_fallback") return def ?? candidates[0]!;
  return [...candidates].sort((a, b) => total(b) - total(a) || a.sort_order - b.sort_order)[0]!;
}
