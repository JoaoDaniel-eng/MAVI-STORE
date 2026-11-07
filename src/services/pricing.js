// Preço do pedido: uma única fonte de verdade para criar pedido, editar pedido e validar cupom.
// Tudo em centavos (inteiros). Funções puras: não acessam banco nem Express, então são fáceis de testar.
import { calculateComboDiscount } from './promotions.js';

// Acima disso o pedido é recusado (R$ 20.000,00).
export const MAX_ORDER_SUBTOTAL_CENTS = 2000000;

// Colher: R$ 0,10 por unidade, na quantidade que o cliente escolher (0 a MAX_SPOONS). Não entra no combo nem no cupom.
export const SPOON_PRICE_CENTS = 10;
export const MAX_SPOONS = 10;

// Lê a quantidade de colheres vinda do navegador. Devolve um inteiro de 0 a MAX_SPOONS, ou null se for inválida.
// `legacyNeedsSpoon` aceita o campo antigo needsSpoon ('yes'/'no'), para quem ainda estiver com o site em cache: 'yes' = 1 colher.
export function parseSpoonQuantity(quantity, legacyNeedsSpoon) {
  if (quantity === undefined || quantity === null || quantity === '') {
    if (legacyNeedsSpoon === undefined || legacyNeedsSpoon === null || legacyNeedsSpoon === 'no' || legacyNeedsSpoon === false) return 0;
    return legacyNeedsSpoon === 'yes' || legacyNeedsSpoon === true ? 1 : null;
  }
  if (typeof quantity !== 'number' && typeof quantity !== 'string') return null;
  if (typeof quantity === 'string' && quantity.trim() === '') return null;
  const n = Number(quantity);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SPOONS ? n : null;
}

// Camadas de adicional pago (extras e mousses): o cliente escolhe quantas camadas quiser, até MAX_OPTION_LAYERS.
// A 1ª camada custa o preço normal; cada camada seguinte custa o preço normal MENOS R$ 1,00 (nunca abaixo de zero).
// Ex.: adicional de R$ 4,00 → 1 camada = R$ 4,00 · 2 = R$ 7,00 · 3 = R$ 10,00 · 4 = R$ 13,00.
export const MAX_OPTION_LAYERS = 20;
export const LAYER_DISCOUNT_CENTS = 100;
export const LAYERED_CATEGORIES = ['extra', 'mousse'];

export function optionLayerPriceCents(unitPriceCents, layers = 1) {
  const base = Math.max(0, Number(unitPriceCents) || 0);
  const n = Math.max(1, Math.trunc(Number(layers) || 1));
  return base + (n - 1) * Math.max(0, base - LAYER_DISCOUNT_CENTS);
}

// Lê o mapa { idDoAdicional: camadas } vindo do navegador. Devolve um objeto limpo (só inteiros de 1 a MAX_OPTION_LAYERS),
// {} quando não veio nada, ou null se o formato for inválido.
export function parseOptionLayers(raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d+$/.test(key)) return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_OPTION_LAYERS) return null;
    clean[Number(key)] = n;
  }
  return clean;
}

// Erro de regra de preço. As rotas respondem com `status` e `message` (sem expor detalhes internos).
export class PricingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PricingError';
    this.status = status;
  }
}

export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const toCents = value => Number(value || 0);

// Lê as regras de combo das configurações da loja (valores vêm como texto do banco).
export function comboRules(settings = {}) {
  return {
    minItems: Number(settings.combo_min_items || 2),
    percent: Number(settings.combo_discount_percent || 5),
  };
}

// Monta uma linha do pedido a partir do tamanho e dos adicionais já carregados do banco.
// `size`: { id, name, price_cents, product_name }. `options`: lista de { id, name, category, price_cents }
// (um elemento undefined/null significa que o adicional escolhido não existe mais).
export function buildOrderItem({ size, options, quantity, maxToppings = 5, layers = {} }) {
  if (options.some(option => !option)) throw new PricingError('Adicional inválido.');
  if (options.filter(option => option.category === 'topping').length > maxToppings) {
    throw new PricingError(`Escolha no máximo ${maxToppings} acompanhamentos por açaí.`);
  }
  if (options.filter(option => option.category === 'syrup').length > 1) {
    throw new PricingError('Escolha apenas uma calda por açaí.');
  }
  // Camadas só valem para adicional pago (extra/mousse com preço). Sem informação = 1 camada.
  const layersOf = option => {
    const n = Number(layers?.[option.id] ?? 1);
    if (!Number.isInteger(n) || n < 1 || n > MAX_OPTION_LAYERS) throw new PricingError(`Escolha de 1 a ${MAX_OPTION_LAYERS} camadas.`);
    if (n > 1 && (!LAYERED_CATEGORIES.includes(option.category) || toCents(option.price_cents) <= 0)) throw new PricingError('Só os adicionais pagos aceitam camadas.');
    return n;
  };
  const priced = options.map(option => {
    const n = layersOf(option);
    return { option, layers: n, priceCents: optionLayerPriceCents(option.price_cents, n) };
  });
  const unitPriceCents = toCents(size.price_cents) + priced.reduce((sum, p) => sum + p.priceCents, 0);
  return {
    product: size.product_name,
    sizeId: size.id,
    size: size.name,
    quantity,
    // priceCents = valor total do adicional já com as camadas; `layers` só aparece quando passa de 1 (pedidos antigos não têm).
    options: priced.map(({ option, layers: n, priceCents }) => ({
      id: option.id,
      name: option.name,
      category: option.category,
      priceCents,
      ...(n > 1 ? { layers: n } : {}),
    })),
    unitPriceCents,
    lineTotalCents: unitPriceCents * quantity,
  };
}

// Soma as linhas já montadas: subtotal e quantidade total de copos (a quantidade conta para o combo).
export function summarizeItems(items) {
  return {
    subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function assertWithinOrderLimit(subtotalCents) {
  if (subtotalCents > MAX_ORDER_SUBTOTAL_CENTS) {
    throw new PricingError('O valor do pedido ultrapassa o limite permitido. Divida em dois pedidos.');
  }
}

// Desconto do cupom sobre a base (subtotal já sem o combo). Percentual é arredondado para baixo
// e nunca passa de 100%; valor fixo nunca passa da base.
export function calculateCouponDiscount(baseCents, coupon) {
  const value = Number(coupon.discount_value);
  if (coupon.discount_type === 'percent') return Math.floor((baseCents * Math.min(100, value)) / 100);
  return Math.min(baseCents, value);
}

export function couponMinimumMessage(minimumCents) {
  return `Este cupom exige um subtotal mínimo de ${formatBRL(minimumCents)}.`;
}

// Calcula todos os valores do pedido.
//   subtotalCents / itemCount: ver summarizeItems
//   deliveryFeeCents: taxa do bairro
//   combo: { minItems, percent } (ver comboRules)
//   spoons: quantidade de colheres (cada uma soma SPOON_PRICE_CENTS ao total)
//   coupon: linha da tabela coupons ({ code, discount_type, discount_value, min_subtotal_cents }) ou null
// Se o cupom não atinge o subtotal mínimo, ele NÃO é aplicado e `couponRejected` traz o motivo; quem chama decide
// o que fazer (criar pedido e validar cupom recusam; editar pedido simplesmente remove o cupom).
export function priceOrder({ subtotalCents, itemCount, deliveryFeeCents = 0, combo = {}, coupon = null, spoons = 0 }) {
  const subtotal = toCents(subtotalCents);
  const fee = toCents(deliveryFeeCents);
  const spoonCents = Math.max(0, Math.trunc(Number(spoons) || 0)) * SPOON_PRICE_CENTS;
  const comboDiscountCents = calculateComboDiscount(subtotal, itemCount, combo.minItems ?? 2, combo.percent ?? 5);
  const base = Math.max(0, subtotal - comboDiscountCents);
  let couponDiscountCents = 0;
  let couponCode = null;
  let couponRejected = null;
  if (coupon) {
    const minimumCents = toCents(coupon.min_subtotal_cents);
    if (base < minimumCents) {
      couponRejected = { reason: 'minimum', minimumCents, message: couponMinimumMessage(minimumCents) };
    } else {
      couponCode = coupon.code;
      couponDiscountCents = calculateCouponDiscount(base, coupon);
    }
  }
  return {
    subtotalCents: subtotal,
    itemCount: Number(itemCount) || 0,
    comboDiscountCents,
    couponCode,
    couponDiscountCents,
    couponRejected,
    deliveryFeeCents: fee,
    spoonCents,
    totalCents: base - couponDiscountCents + fee + spoonCents,
  };
}
