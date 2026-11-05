import { z } from "zod";

export const MAX_LINE_QTY = 10;
export const PAYMENT_METHODS = ["pix", "card", "pay_on_pickup"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = { pix: "Pix", card: "Cartão", pay_on_pickup: "Pagar na retirada" };

/** Valida CPF pelos dígitos verificadores. */
export function isValidCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const uuid = z.string().uuid();
export const cartItemSchema = z.object({ skuId: uuid, quantity: z.number().int().min(1).max(MAX_LINE_QTY) });
export const cartItemsSchema = z.array(cartItemSchema).min(1).max(30);
const couponCode = z.string().trim().min(1).max(40);

export const cartQuoteSchema = z.object({ items: cartItemsSchema, couponCode: couponCode.optional() });
export const shippingQuoteSchema = z.object({
  items: cartItemsSchema,
  postalCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido").transform((s) => s.replace("-", "")),
});

const addressSchema = z.object({
  recipient: z.string().trim().min(3).max(120),
  postalCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido").transform((s) => s.replace("-", "")),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "UF inválida"),
});

export const checkoutSchema = z
  .object({
    items: cartItemsSchema,
    couponCode: couponCode.optional(),
    customer: z.object({
      name: z.string().trim().min(3).max(120),
      email: z.string().trim().toLowerCase().email().max(254),
      phone: z.string().trim().transform((s) => s.replace(/\D/g, "")).pipe(z.string().regex(/^\d{10,13}$/, "Telefone inválido")),
      document: z.string().trim().transform((s) => s.replace(/\D/g, "")).refine(isValidCpf, "CPF inválido"),
    }),
    fulfillment: z.discriminatedUnion("type", [
      z.object({ type: z.literal("ship"), serviceId: z.number().int(), address: addressSchema }),
      z.object({ type: z.literal("pickup"), locationCode: z.string().regex(/^[a-z0-9-]+$/) }),
    ]),
    paymentMethod: z.enum(PAYMENT_METHODS),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar os termos." }) }),
    notes: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.paymentMethod !== "pay_on_pickup" || v.fulfillment.type === "pickup", {
    message: "Pagar na retirada só vale para retirada na loja.",
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* ---------- Cupons (painel) ---------- */
export const COUPON_TYPES = ["percent", "fixed", "free_shipping"] as const;
const money = z.number().int().min(0).max(10_000_000);
const couponFields = {
  description: z.string().trim().max(200).nullable().optional(),
  value: z.number().int().min(0).max(10_000_000).optional(),
  minSubtotalCents: money.optional(),
  maxDiscountCents: z.number().int().min(1).max(10_000_000).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
};
export const couponCreateSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Use 3 a 30 letras, números, - ou _"),
    type: z.enum(COUPON_TYPES),
    ...couponFields,
  })
  .refine((v) => (v.type === "percent" ? (v.value ?? 0) >= 1 && (v.value ?? 0) <= 100 : v.type === "fixed" ? (v.value ?? 0) >= 1 : true), {
    message: "Percentual deve ser de 1 a 100; valor fixo, maior que zero (em centavos).",
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: "O fim deve ser depois do início." });
export const couponUpdateSchema = z.object(couponFields).partial();

/* ---------- Unidades (painel) ---------- */
export const locationUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    address: z.string().trim().max(200).nullable(),
    postalCode: z.string().trim().regex(/^\d{8}$/, "Use 8 dígitos").nullable(),
    phone: z.string().trim().max(30).nullable(),
    whatsapp: z.string().trim().regex(/^\d{10,15}$/, "Use só dígitos com DDD (ex.: 5521999999999)").nullable(),
    openingHours: z.array(z.object({ label: z.string().trim().min(1).max(40), hours: z.string().trim().min(1).max(60) })).max(10).nullable(),
    pickupEnabled: z.boolean(),
    pickupFeeCents: z.number().int().min(0).max(100_000),
    canShipFrom: z.boolean(),
    isActive: z.boolean(),
  })
  .partial();

/* ---------- Respostas ---------- */
export type PricedLine = {
  skuId: string;
  productId: string | null;
  productName: string;
  slug: string | null;
  skuCode: string | null;
  colorName: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  available: number;
  problem: null | "unavailable" | "insufficient_stock";
};

export type CartQuote = {
  lines: PricedLine[];
  subtotalCents: number;
  coupon: { code: string; type: (typeof COUPON_TYPES)[number]; discountCents: number; freeShipping: boolean } | null;
  couponError: string | null;
  hasProblems: boolean;
};

export type ShippingOption = { serviceId: number; name: string; company: string; priceCents: number; deliveryDays: number };
export type PickupOption = { code: string; name: string; shoppingName: string; feeCents: number; available: boolean };
export type ShippingQuote = {
  shipping: {
    available: boolean;
    reason?: "credentials_pending" | "origin_postal_code_pending" | "no_stock" | "service_error" | "no_options";
    message?: string;
    origin?: { code: string; name: string };
    options: ShippingOption[];
  };
  pickup: PickupOption[];
};

export type OrderSummary = {
  id: string;
  number: number;
  status: string;
  paymentStatus: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  expiresAt: string;
  accessToken: string;
};

export type OrderView = Omit<OrderSummary, "accessToken"> & {
  fulfillment: "ship" | "pickup";
  pickupLocation: string | null;
  address: Record<string, string> | null;
  shippingService: { name: string; company: string; deliveryDays: number } | null;
  items: Array<{ productName: string; skuCode: string; colorName: string; sizeLabel: string; imageUrl: string | null; unitPriceCents: number; quantity: number; totalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  shippingDiscountCents: number;
  couponCode: string | null;
  createdAt: string;
  trackingCode: string | null;
  pickupCode: string | null; // só aparece para a cliente quando o pedido está pronto para retirada
  timeline: Array<{ status: string; note: string | null; createdAt: string }>;
};

export type PaymentView = {
  method: PaymentMethod;
  status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  pix?: { copyPaste: string; qrImageBase64: string | null };
  redirectUrl?: string;
};
