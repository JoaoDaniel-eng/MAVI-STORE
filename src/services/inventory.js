export function convertConsumptionToStockUnit(amount, measure, stockUnit) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error('A quantidade de consumo precisa ser maior que zero.');
  if (measure === 'g' && stockUnit === 'kg')
    return value / 1000;
  if (measure === 'ml' && stockUnit === 'l')
    return value / 1000;
  if ((measure === 'g' && stockUnit === 'g') || (measure === 'ml' && stockUnit === 'ml') || (measure === 'un' && stockUnit === 'un'))
    return value;
  throw new Error(`A unidade do consumo não combina com a unidade do estoque (${stockUnit}).`);
}
// Caminho inverso: transforma o que está salvo na unidade do estoque na medida de consumo (kg -> g, L -> ml).
export function convertStockToConsumption(stored, measure, stockUnit) {
  const value = Number(stored);
  if (!Number.isFinite(value))
    return 0;
  const factor = (measure === 'g' && stockUnit === 'kg') || (measure === 'ml' && stockUnit === 'l') ? 1000 : 1;
  return Math.round(value * factor * 1000) / 1000;
}
// Fator para trocar a unidade do estoque sem perder o saldo (kg <-> g, L <-> ml).
const STOCK_FACTORS = { 'kg>g': 1000, 'g>kg': 0.001, 'l>ml': 1000, 'ml>l': 0.001 };
export function stockUnitFactor(from, to) {
  if (from === to)
    return 1;
  const factor = STOCK_FACTORS[`${from}>${to}`];
  if (!factor)
    throw new Error('Só é possível trocar entre kg e g, ou entre L e ml. Para outra unidade, cadastre um novo produto.');
  return factor;
}
export function convertStockQuantity(value, from, to) {
  return Math.round(Number(value) * stockUnitFactor(from, to) * 1000) / 1000;
}
// Unidade de consumo padrão para cada unidade de estoque.
export function defaultConsumptionUnit(stockUnit) {
  if (stockUnit === 'kg' || stockUnit === 'g')
    return 'g';
  if (stockUnit === 'l' || stockUnit === 'ml')
    return 'ml';
  return 'un';
}
// Situação do item para o medidor: usa o alerta mínimo quando existir; senão 20% da quantidade cheia.
export function stockStatus({ quantity, capacity, minimum }) {
  const q = Number(quantity) || 0, cap = Math.max(Number(capacity) || 0, q), min = Number(minimum) || 0;
  const percent = cap > 0 ? Math.max(0, Math.min(100, (q / cap) * 100)) : 0;
  if (q <= 0)
    return { key: 'empty', label: 'Esgotado', percent: 0 };
  if ((min > 0 && q <= min) || percent <= 20)
    return { key: 'low', label: 'Está acabando', percent };
  return { key: 'good', label: 'Estoque bom', percent };
}
// ---- Venda x estoque: tamanhos cujo consumo (receita por tamanho) não cabe mais no saldo ----
// `rows`: { inventory_item_id, size_id, quantity (consumo por copo, na unidade do estoque), stock (saldo), name }
const EPS = 1e-9;
// Tamanhos que o site deve mostrar como esgotados: o saldo não cobre nem um copo.
export function soldOutSizeIds(rows) {
  const out = new Set();
  for (const r of rows)
    if (r.size_id && Number(r.stock) + EPS < Number(r.quantity))
      out.add(Number(r.size_id));
  return out;
}
// Primeiro ingrediente que não cobre o pedido inteiro, somando todos os copos (ou null se tudo cabe).
// `items`: { sizeId, quantity }
export function findStockShortage(items, rows) {
  const need = new Map(), info = new Map();
  for (const item of items) {
    for (const r of rows) {
      if (Number(r.size_id) !== Number(item.sizeId))
        continue;
      const id = Number(r.inventory_item_id);
      need.set(id, (need.get(id) || 0) + Number(r.quantity) * Number(item.quantity || 1));
      info.set(id, r);
    }
  }
  for (const [id, amount] of need) {
    const r = info.get(id);
    if (Number(r.stock) + EPS < amount)
      return { itemId: id, name: r.name, need: amount, stock: Number(r.stock) };
  }
  return null;
}
