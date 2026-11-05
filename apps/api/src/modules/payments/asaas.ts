import crypto from "node:crypto";
import { env } from "../../config/env";
import { GatewayError, reais, toCents, type GwOrder, type GwStatus, type PaymentGateway, type WebhookReq } from "./types";

const base = () => (env.ASAAS_ENV === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3");

async function asaasCall<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base() + path, {
      method: init.method,
      headers: { access_token: env.ASAAS_API_KEY ?? "", "Content-Type": "application/json", "User-Agent": "MAVI" },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GatewayError("Asaas indisponível.");
  }
  if (!res.ok) throw new GatewayError(`Asaas respondeu ${res.status}.`);
  return (await res.json()) as T;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

async function charge(o: GwOrder, billingType: "PIX" | "CREDIT_CARD") {
  const customer = await asaasCall<{ id: string }>("/customers", {
    method: "POST",
    body: { name: o.customer.name, cpfCnpj: o.customer.document, email: o.customer.email, mobilePhone: o.customer.phone, externalReference: o.id },
  });
  return asaasCall<{ id: string; invoiceUrl?: string }>("/payments", {
    method: "POST",
    body: { customer: customer.id, billingType, value: reais(o.totalCents), dueDate: today(), externalReference: o.id, description: `Pedido ${o.number} MAVI` },
  });
}

const STATUS: Record<string, GwStatus> = {
  RECEIVED: "paid", CONFIRMED: "paid", PENDING: "pending", AWAITING_RISK_ANALYSIS: "pending",
  OVERDUE: "failed", REFUSED: "failed", REFUNDED: "refunded", REFUND_REQUESTED: "refunded",
  CHARGEBACK_REQUESTED: "refunded", CHARGEBACK_DISPUTE: "refunded", DELETED: "cancelled",
};

export const asaas: PaymentGateway = {
  id: "asaas",
  configured: () => Boolean(env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN),

  async createPix(o) {
    const p = await charge(o, "PIX");
    const qr = await asaasCall<{ encodedImage?: string; payload?: string }>(`/payments/${encodeURIComponent(p.id)}/pixQrCode`, { method: "GET" });
    if (!p.id || !qr.payload) throw new GatewayError("Resposta do Asaas sem código Pix.");
    return { gatewayPaymentId: p.id, copyPaste: qr.payload, qrImageBase64: qr.encodedImage ?? null };
  },

  async createCardCheckout(o) {
    const p = await charge(o, "CREDIT_CARD");
    if (!p.id || !p.invoiceUrl) throw new GatewayError("Resposta do Asaas sem link de pagamento.");
    return { gatewayPaymentId: p.id, gatewayReference: null, redirectUrl: p.invoiceUrl };
  },

  verifyWebhook({ headers }: WebhookReq) {
    const expected = env.ASAAS_WEBHOOK_TOKEN;
    const got = String(headers["asaas-access-token"] ?? "");
    return Boolean(expected) && got.length === expected!.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected!));
  },

  paymentIdFromWebhook({ body }: WebhookReq) {
    const b = (body ?? {}) as { event?: string; payment?: { id?: string } };
    return b.event?.startsWith("PAYMENT_") && b.payment?.id ? b.payment.id : null;
  },

  async fetchPayment(id) {
    const d = await asaasCall<{ id: string; status: string; value: number; externalReference?: string | null }>(`/payments/${encodeURIComponent(id)}`, { method: "GET" });
    return { gatewayPaymentId: d.id, orderId: d.externalReference ?? null, amountCents: toCents(d.value), status: STATUS[d.status] ?? "pending" };
  },
};
