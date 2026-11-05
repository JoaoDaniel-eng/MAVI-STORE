import { z } from "zod";

const uuid = z.string().uuid();
const qty = z.number().int().min(1).max(100_000);
const reason = z.string().trim().max(200);
const pagination = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

export const MOVEMENT_TYPES = ["entry", "exit", "adjustment", "transfer_in", "transfer_out", "sale"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const movementCreateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("entry"), skuId: uuid, locationId: uuid, quantity: qty, reason: reason.optional() }),
  z.object({ type: z.literal("exit"), skuId: uuid, locationId: uuid, quantity: qty, reason: reason.optional() }),
  // Ajuste = contagem física: informa o saldo final; o motivo é obrigatório.
  z.object({
    type: z.literal("adjustment"),
    skuId: uuid,
    locationId: uuid,
    newOnHand: z.number().int().min(0).max(100_000),
    reason: reason.min(3),
  }),
]);
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;

export const transferSchema = z
  .object({
    fromLocationId: uuid,
    toLocationId: uuid,
    items: z.array(z.object({ skuId: uuid, quantity: qty })).min(1).max(50),
    reason: reason.optional(),
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, { message: "Origem e destino devem ser diferentes." })
  .refine((v) => new Set(v.items.map((i) => i.skuId)).size === v.items.length, {
    message: "SKU repetido na transferência.",
  });
export type TransferInput = z.infer<typeof transferSchema>;

export const thresholdSchema = z.object({
  skuId: uuid,
  locationId: uuid,
  threshold: z.number().int().min(0).max(1000).nullable(), // null = usar o padrão das configurações
});

export const stockListQuerySchema = z.object({
  locationId: uuid.optional(),
  productId: uuid.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  lowOnly: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  ...pagination,
});
export type StockListQuery = z.infer<typeof stockListQuerySchema>;

export const movementsQuerySchema = z.object({
  skuId: uuid.optional(),
  locationId: uuid.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...pagination,
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

export const reservationsQuerySchema = z.object({
  status: z.enum(["active", "committed", "released", "expired"]).optional(),
  ...pagination,
});
