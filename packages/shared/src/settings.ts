import { z } from "zod";

export const ORIGIN_STRATEGIES = ["default_only", "default_with_fallback", "most_stock"] as const;

/** Chaves editáveis de `settings` e o formato de cada valor. */
export const SETTING_SCHEMAS = {
  "store.name": z.string().trim().min(1).max(60),
  "shipping.origin_rule": z.object({
    strategy: z.enum(ORIGIN_STRATEGIES),
    default_location_code: z.string().regex(/^[a-z0-9-]+$/),
  }),
  "stock.low_stock_threshold": z.object({ default: z.number().int().min(0).max(1000) }),
  "payments.enabled_methods": z.array(z.enum(["pix", "card", "pay_on_pickup"])).max(3),
  "stock.reservation_ttl_minutes": z.number().int().min(5).max(120),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as [SettingKey, ...SettingKey[]];

export const settingUpdateSchema = z.object({ value: z.unknown() });
