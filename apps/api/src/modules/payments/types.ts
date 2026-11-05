export type GatewayId = "mercadopago" | "asaas";

export type GwOrder = {
  id: string;
  number: number;
  totalCents: number;
  customer: { name: string; email: string; phone: string; document: string };
  returnUrl: string; // página do pedido, usada no retorno do checkout hospedado
};
export type PixCharge = { gatewayPaymentId: string; copyPaste: string; qrImageBase64: string | null };
export type CardCheckout = { gatewayPaymentId: string | null; gatewayReference: string | null; redirectUrl: string };
export type GwStatus = "paid" | "pending" | "failed" | "cancelled" | "refunded";
export type GwPayment = { gatewayPaymentId: string; orderId: string | null; amountCents: number; status: GwStatus };
export type WebhookReq = { headers: Record<string, unknown>; query: Record<string, unknown>; body: unknown };

export class GatewayError extends Error {}

export interface PaymentGateway {
  id: GatewayId;
  configured(): boolean;
  createPix(order: GwOrder, idempotencyKey: string): Promise<PixCharge>;
  /** Cartão sempre em página hospedada pelo gateway: nenhum dado de cartão passa por aqui. */
  createCardCheckout(order: GwOrder, idempotencyKey: string): Promise<CardCheckout>;
  verifyWebhook(req: WebhookReq): boolean;
  paymentIdFromWebhook(req: WebhookReq): string | null;
  /** Consulta o pagamento direto no gateway: a notificação nunca é usada como prova. */
  fetchPayment(id: string): Promise<GwPayment>;
}

export const reais = (cents: number) => Number((cents / 100).toFixed(2));
export const toCents = (v: unknown) => Math.round(Number(v) * 100);
