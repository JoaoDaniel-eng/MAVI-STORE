import "dotenv/config";
import { z } from "zod";

const optional = z.string().min(1).optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),

  // Autenticação
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET precisa ter ao menos 32 caracteres"),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: optional,

  SITE_URL: z.string().url().optional(), // endereço público da loja (sitemap)

  ORDER_RETENTION_YEARS: z.coerce.number().int().min(1).max(30).default(5), // prazo para anonimizar pedidos (confirmar com a contabilidade)
  API_PUBLIC_URL: z.string().url().optional(), // URL pública da API (webhooks dos gateways)

  // Pagamentos
  PAYMENT_GATEWAY: z.enum(["mercadopago", "asaas"]).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: optional,
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("production"),
  ASAAS_WEBHOOK_TOKEN: optional,

  // Integrações (ausentes = "pendente")
  MERCADOPAGO_ACCESS_TOKEN: optional,
  ASAAS_API_KEY: optional,
  MELHOR_ENVIO_TOKEN: optional,
  MELHOR_ENVIO_ENV: z.enum(["sandbox", "production"]).default("production"),
  MELHOR_ENVIO_CONTACT_EMAIL: z.string().email().optional(), // exigido pela API no User-Agent
  EMAIL_API_KEY: optional,
  EMAIL_FROM: optional, // ex.: MAVI <contato@sualoja.com.br> (domínio verificado no provedor)
  STORAGE_BUCKET: optional,
  STORAGE_ACCESS_KEY: optional,
  STORAGE_SECRET_KEY: optional,
  STORAGE_ENDPOINT: optional,
  STORAGE_PUBLIC_URL: z.string().url().optional(), // URL pública do bucket/CDN
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
