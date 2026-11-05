import { z } from "zod";
import { emailSchema, passwordSchema } from "./base";

const pagination = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};
const note = z.string().trim().max(300).optional();

/* ---------- Pedidos (painel) ---------- */
export const ORDER_STATUSES = ["awaiting_payment", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled"] as const;

export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
  fulfillment: z.enum(["ship", "pickup"]).optional(),
  location: z.string().regex(/^[a-z0-9-]+$/).optional(),
  requiresRefund: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  q: z.string().trim().min(1).max(100).optional(),
  ...pagination,
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const orderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("process"), note }),
  z.object({ action: z.literal("ship"), trackingCode: z.string().trim().max(60).optional(), note }),
  z.object({ action: z.literal("ready"), note }),
  z.object({
    action: z.literal("deliver"),
    pickupCode: z.string().trim().regex(/^\d{6}$/, "O código tem 6 dígitos").optional(),
    paymentReceived: z.boolean().optional(),
    note,
  }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("refund_done"), note }),
]);
export type OrderAction = z.infer<typeof orderActionSchema>;

/* ---------- Conta da cliente ---------- */
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{10,20}$/, "Telefone inválido").nullable(),
    marketingOptIn: z.boolean(),
  })
  .partial();
export const mergeFavoritesSchema = z.object({ ids: z.array(z.string().uuid()).max(100) });

/* ---------- Avaliações ---------- */
export const reviewCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  body: z.string().trim().min(10, "Conte um pouco mais (mínimo 10 caracteres)").max(1500),
});
export const reviewsQuerySchema = z.object(pagination);
export const adminReviewsQuerySchema = z.object({ status: z.enum(["pending", "approved", "rejected"]).optional(), ...pagination });
export const reviewModerateSchema = z.object({ status: z.enum(["approved", "rejected"]), note });

export type ReviewsResponse = {
  summary: { average: number | null; count: number; distribution: [number, number, number, number, number] };
  items: Array<{ id: string; rating: number; title: string | null; body: string; authorName: string; createdAt: string }>;
  total: number;
  canReview: boolean | null; // null = visitante sem login
};

export type AccountOrderRow = { id: string; number: number; status: string; paymentStatus: string; totalCents: number; createdAt: string };

/* ---------- Privacidade (LGPD) ---------- */
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });
export const privacyEmailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
