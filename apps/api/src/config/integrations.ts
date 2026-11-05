import type { Integration, IntegrationStatus } from "@mavi/shared";
import { env } from "./env";

const present = (...values: Array<string | undefined>) => values.every(Boolean);

export function getIntegrationStatus(): Record<Integration, IntegrationStatus> {
  const s = (ok: boolean): IntegrationStatus => (ok ? "credenciais_presentes" : "pendente");
  return {
    mercadopago: s(present(env.MERCADOPAGO_ACCESS_TOKEN)),
    asaas: s(present(env.ASAAS_API_KEY)),
    melhor_envio: s(present(env.MELHOR_ENVIO_TOKEN, env.MELHOR_ENVIO_CONTACT_EMAIL)),
    email: s(present(env.EMAIL_API_KEY, env.EMAIL_FROM)),
    storage: s(
      present(env.STORAGE_BUCKET, env.STORAGE_ACCESS_KEY, env.STORAGE_SECRET_KEY, env.STORAGE_ENDPOINT, env.STORAGE_PUBLIC_URL),
    ),
  };
}
