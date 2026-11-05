import { env } from "../config/env";

export type MeProduct = { id: string; widthCm: number; heightCm: number; lengthCm: number; weightKg: number; insuranceValue: number; quantity: number };
export type MeService = { serviceId: number; name: string; company: string; priceCents: number; deliveryDays: number };
export type MeResult = { ok: true; services: MeService[] } | { ok: false; reason: "credentials_pending" | "service_error" };

type RawService = {
  id?: number; name?: string; price?: string | number; custom_price?: string | number;
  delivery_time?: number; custom_delivery_time?: number; error?: string; company?: { name?: string };
};

export const melhorEnvioReady = () => Boolean(env.MELHOR_ENVIO_TOKEN && env.MELHOR_ENVIO_CONTACT_EMAIL);

/** Cotação no Melhor Envio (só backend). Não inventa valores: qualquer falha vira "indisponível". */
export async function quoteMelhorEnvio(p: { fromCep: string; toCep: string; products: MeProduct[] }): Promise<MeResult> {
  if (!melhorEnvioReady()) return { ok: false, reason: "credentials_pending" };
  const base = env.MELHOR_ENVIO_ENV === "sandbox" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
  try {
    const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `MAVI (${env.MELHOR_ENVIO_CONTACT_EMAIL})`,
      },
      body: JSON.stringify({
        from: { postal_code: p.fromCep },
        to: { postal_code: p.toCep },
        products: p.products.map((x) => ({
          id: x.id, width: x.widthCm, height: x.heightCm, length: x.lengthCm, weight: x.weightKg,
          insurance_value: x.insuranceValue, quantity: x.quantity,
        })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: "service_error" };
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return { ok: false, reason: "service_error" };

    const services: MeService[] = [];
    for (const s of data as RawService[]) {
      const price = Number(s.custom_price ?? s.price);
      const days = Number(s.custom_delivery_time ?? s.delivery_time);
      if (s.error || typeof s.id !== "number" || !s.name || !Number.isFinite(price) || price < 0 || !Number.isFinite(days)) continue;
      services.push({ serviceId: s.id, name: s.name, company: s.company?.name ?? "", priceCents: Math.round(price * 100), deliveryDays: days });
    }
    return { ok: true, services: services.sort((a, b) => a.priceCents - b.priceCents) };
  } catch {
    return { ok: false, reason: "service_error" };
  }
}
