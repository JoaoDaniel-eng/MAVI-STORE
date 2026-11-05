import { env } from "../../config/env";
import { asaas } from "./asaas";
import { mercadopago } from "./mercadopago";
import type { GatewayId, PaymentGateway } from "./types";

const gateways: Record<GatewayId, PaymentGateway> = { mercadopago, asaas };

export const getGateway = (id: string): PaymentGateway | null => (id in gateways ? gateways[id as GatewayId] : null);

/** Gateway ligado: escolhido por PAYMENT_GATEWAY e só se as credenciais estiverem completas. */
export function activeGateway(): PaymentGateway | null {
  if (!env.PAYMENT_GATEWAY) return null;
  const g = gateways[env.PAYMENT_GATEWAY];
  return g.configured() ? g : null;
}
