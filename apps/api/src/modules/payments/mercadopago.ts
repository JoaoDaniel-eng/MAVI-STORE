import crypto from "node:crypto";
import { env } from "../../config/env";
import { GatewayError, reais, toCents, type GwStatus, type PaymentGateway, type WebhookReq } from "./types";

const BASE = "https://api.mercadopago.com";
const notificationUrl = () => `${env.API_PUBLIC_URL}/api/webhooks/mercadopago`;

async function mp<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey && { "X-Idempotency-Key": init.idempotencyKey }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GatewayError("Mercado Pago indisponível.");
  }
  if (!res.ok) throw new GatewayError(`Mercado Pago respondeu ${res.status}.`);
  return (await res.json()) as T;
}

const STATUS: Record<string, GwStatus> = {
  approved: "paid", pending: "pending", in_process: "pending", authorized: "pending", in_mediation: "pending",
  rejected: "failed", cancelled: "cancelled", refunded: "refunded", charged_back: "refunded",
};

export const mercadopago: PaymentGateway = {
  id: "mercadopago",
  configured: () => Boolean(env.MERCADOPAGO_ACCESS_TOKEN && env.API_PUBLIC_URL),

  async createPix(o, idempotencyKey) {
    const [first, ...rest] = o.customer.name.split(" ");
    const d = await mp<{ id: number; point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } } }>("/v1/payments", {
      method: "POST", idempotencyKey,
      body: {
        transaction_amount: reais(o.totalCents), description: `Pedido ${o.number} MAVI`, payment_method_id: "pix",
        external_reference: o.id, notification_url: notificationUrl(),
        payer: { email: o.customer.email, first_name: first, last_name: rest.join(" ") || first, identification: { type: "CPF", number: o.customer.document } },
      },
    });
    const t = d.point_of_interaction?.transaction_data;
    if (!d.id || !t?.qr_code) throw new GatewayError("Resposta do Mercado Pago sem código Pix.");
    return { gatewayPaymentId: String(d.id), copyPaste: t.qr_code, qrImageBase64: t.qr_code_base64 ?? null };
  },

  async createCardCheckout(o, idempotencyKey) {
    const d = await mp<{ id: string; init_point?: string; sandbox_init_point?: string }>("/checkout/preferences", {
      method: "POST", idempotencyKey,
      body: {
        items: [{ id: o.id, title: `Pedido ${o.number} MAVI`, quantity: 1, unit_price: reais(o.totalCents), currency_id: "BRL" }],
        external_reference: o.id, notification_url: notificationUrl(),
        back_urls: { success: o.returnUrl, pending: o.returnUrl, failure: o.returnUrl }, auto_return: "approved",
        // Só cartões: exclui boleto, caixa eletrônico e transferência (Pix tem fluxo próprio).
        payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }] },
      },
    });
    const url = d.init_point ?? d.sandbox_init_point;
    if (!d.id || !url) throw new GatewayError("Resposta do Mercado Pago sem link de pagamento.");
    return { gatewayPaymentId: null, gatewayReference: d.id, redirectUrl: url };
  },

  verifyWebhook({ headers, query }: WebhookReq) {
    const secret = env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret) return true; // sem segredo: a segurança vem da consulta direta ao gateway
    const parts = Object.fromEntries(
      String(headers["x-signature"] ?? "").split(",").map((p) => p.trim().split("=") as [string, string]),
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;
    const manifest = `id:${String(query["data.id"] ?? "").toLowerCase()};request-id:${String(headers["x-request-id"] ?? "")};ts:${ts};`;
    const mac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    return mac.length === v1.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(v1));
  },

  paymentIdFromWebhook({ query, body }: WebhookReq) {
    const b = (body ?? {}) as { type?: string; data?: { id?: string | number } };
    const topic = b.type ?? String(query["type"] ?? query["topic"] ?? "");
    if (topic !== "payment") return null;
    const id = b.data?.id ?? query["data.id"] ?? query["id"];
    return id ? String(id) : null;
  },

  async fetchPayment(id) {
    const d = await mp<{ id: number; status: string; transaction_amount: number; external_reference?: string | null }>(`/v1/payments/${encodeURIComponent(id)}`, { method: "GET" });
    return {
      gatewayPaymentId: String(d.id), orderId: d.external_reference ?? null,
      amountCents: toCents(d.transaction_amount), status: STATUS[d.status] ?? "pending",
    };
  },
};
