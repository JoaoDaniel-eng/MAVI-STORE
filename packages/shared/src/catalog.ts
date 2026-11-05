import { z } from "zod";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug inválido");
const cm = z.number().int().min(1).max(200);

/* ---------- Categorias ---------- */
export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema.optional(),
  parentId: uuid.nullable().optional(),
  description: text(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial();

/* ---------- Cores e tamanhos ---------- */
export const colorCreateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, "Use 2 a 12 letras/números"),
  name: z.string().trim().min(2).max(40),
  hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Use o formato #RRGGBB"),
});
export const colorUpdateSchema = colorCreateSchema.partial();

export const sizeCreateSchema = z.object({
  label: z.string().trim().min(1).max(10),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const sizeUpdateSchema = sizeCreateSchema.partial();

/* ---------- Guia de medidas ---------- */
const guideShape = {
  name: z.string().trim().min(2).max(80),
  description: text(1000).nullable().optional(),
  notes: text(1000).nullable().optional(),
  columns: z.array(z.string().trim().min(1).max(40)).min(2).max(10),
  rows: z.array(z.array(z.string().trim().max(40))).min(1).max(30),
};
const rowsMatch = (v: { columns?: string[] | undefined; rows?: string[][] | undefined }) =>
  (v.columns === undefined) === (v.rows === undefined) &&
  (v.columns === undefined || v.rows!.every((r) => r.length === v.columns!.length));

export const sizeGuideCreateSchema = z
  .object(guideShape)
  .refine(rowsMatch, { message: "Cada linha precisa ter o mesmo número de colunas." });
export const sizeGuideUpdateSchema = z
  .object(guideShape)
  .partial()
  .refine(rowsMatch, { message: "Envie colunas e linhas juntas, com o mesmo número de colunas." });

/* ---------- Produtos ---------- */
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

const productShape = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Use 2 a 20 letras, números ou hífen"),
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  description: text(5000).nullable().optional(),
  composition: text(500).nullable().optional(),
  careInstructions: text(1000).nullable().optional(),
  categoryId: uuid,
  sizeGuideId: uuid.nullable().optional(),
  basePriceCents: z.number().int().min(0).max(10_000_000),
  compareAtPriceCents: z.number().int().min(1).max(10_000_000).nullable().optional(),
  weightG: z.number().int().min(1).max(50_000).nullable().optional(),
  lengthCm: cm.nullable().optional(),
  widthCm: cm.nullable().optional(),
  heightCm: cm.nullable().optional(),
  seoTitle: text(70).nullable().optional(),
  seoDescription: text(160).nullable().optional(),
};

export const productCreateSchema = z.object(productShape); // nasce sempre como rascunho
export const productUpdateSchema = z
  .object({ ...productShape, status: z.enum(PRODUCT_STATUSES) })
  .partial();

export const productListQuerySchema = z.object({
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: uuid.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/* ---------- SKUs e imagens ---------- */
export const skuGenerateSchema = z.object({
  colorIds: z.array(uuid).min(1).max(30),
  sizeIds: z.array(uuid).min(1).max(20),
  priceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
});
export const skuUpdateSchema = z
  .object({
    skuCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,60}$/),
    barcode: text(30).nullable(),
    priceCents: z.number().int().min(0).max(10_000_000).nullable(),
    isActive: z.boolean(),
  })
  .partial();

export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const presignSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  purpose: z.enum(["product", "content"]).default("product"),
});
export const imageRegisterSchema = z.object({
  key: z.string().regex(/^products\/[0-9a-f-]{36}\.(jpg|png|webp)$/, "Chave inválida"),
  alt: text(200).default(""),
  colorId: uuid.nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const imageUpdateSchema = z
  .object({ alt: text(200), colorId: uuid.nullable(), sortOrder: z.number().int().min(0).max(999) })
  .partial();
