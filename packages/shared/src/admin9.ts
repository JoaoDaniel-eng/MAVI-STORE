import { z } from "zod";

const pagination = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

/* ---------- Páginas institucionais ---------- */
const pageShape = {
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug inválido").optional(),
  body: z.string().trim().min(1).max(20_000),
  seoDescription: z.string().trim().max(160).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isPublished: z.boolean().optional(),
  showInFooter: z.boolean().optional(),
};
export const pageCreateSchema = z.object(pageShape);
export const pageUpdateSchema = z.object(pageShape).partial();
/** Endereços reservados que o checkout usa para linkar os termos. */
export const LEGAL_SLUGS = { terms: "termos", privacy: "privacidade" } as const;

/* ---------- Painel ---------- */
export const dashboardQuerySchema = z.object({ days: z.coerce.number().int().refine((n) => [7, 30, 90].includes(n), "Use 7, 30 ou 90").default(30) });
export const customersQuerySchema = z.object({ q: z.string().trim().min(1).max(100).optional(), ...pagination });

export const REPORT_TYPES = ["sales", "items", "stock", "coupons", "customers"] as const;
export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").optional(),
});

export type DashboardData = {
  days: number;
  summary: { orders: number; revenueCents: number; averageTicketCents: number; cancelled: number; awaitingPayment: number };
  series: Array<{ day: string; orders: number; revenueCents: number }>;
  topProducts: Array<{ name: string; units: number; revenueCents: number }>;
  byLocation: Array<{ code: string; orders: number; revenueCents: number }>;
  byMethod: Array<{ method: string; orders: number }>;
  todo: { toProcess: number; processing: number; readyForPickup: number; refundsPending: number; reviewsPending: number; lowStock: number; emailsPending: number; emailsFailed: number };
  integrations: Record<string, string>;
};
