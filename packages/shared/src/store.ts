import { z } from "zod";

/* ---------- Tipos das respostas da loja pública ---------- */
export type StoreColor = { code: string; name: string; hex: string };

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  basePriceCents: number;
  compareAtPriceCents: number | null;
  categoryName: string;
  coverUrl: string | null;
  hoverUrl: string | null;
  colors: StoreColor[];
  inStock: boolean;
};

export type Facets = {
  colors: Array<StoreColor & { count: number }>;
  sizes: Array<{ label: string; count: number }>;
  price: { minCents: number | null; maxCents: number | null };
};

export type ProductListResponse = {
  total: number;
  page: number;
  pageSize: number;
  items: ProductCard[];
  facets: Facets;
};

export type StoreCategory = { id: string; slug: string; name: string; parentId: string | null; productCount: number };

export type StoreLocation = {
  code: string;
  name: string;
  shoppingName: string;
  storeNumber: string;
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  openingHours: unknown;
  pickupEnabled: boolean;
  pickupFeeCents: number;
};

export type StoreSku = {
  id: string;
  skuCode: string;
  colorCode: string;
  sizeLabel: string;
  priceCents: number;
  available: number; // limitado a 5 para não expor o saldo exato
  inStock: boolean;
  lowStock: boolean;
  pickupLocations: string[];
};

export type ProductDetail = {
  id: string;
  slug: string;
  code: string;
  name: string;
  description: string | null;
  composition: string | null;
  careInstructions: string | null;
  categoryName: string;
  categorySlug: string;
  basePriceCents: number;
  compareAtPriceCents: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  images: Array<{ id: string; url: string; alt: string; colorCode: string | null }>;
  colors: StoreColor[];
  sizes: string[];
  skus: StoreSku[];
  sizeGuide: { name: string; description: string | null; notes: string | null; columns: string[]; rows: string[][] } | null;
  related: ProductCard[];
  rating: { average: number; count: number } | null;
};

export type HomeSectionView = {
  id: string;
  kind: "hero" | "banner" | "featured_products" | "category_grid" | "text";
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  products: ProductCard[];
  categories: Array<{ id: string; slug: string; name: string; coverUrl: string | null }>;
};

/* ---------- Consulta do catálogo ---------- */
const csv = z
  .string()
  .trim()
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(40)).max(30));

export const SORTS = ["newest", "price_asc", "price_desc", "name"] as const;

export const storeProductsQuerySchema = z.object({
  category: z.string().trim().max(120).optional(),
  color: csv.optional(),
  size: csv.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(SORTS).default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type StoreProductsQuery = z.infer<typeof storeProductsQuerySchema>;

export const idsQuerySchema = z.object({
  ids: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
});

/* ---------- Home administrável ---------- */
export const HOME_SECTION_KINDS = ["hero", "banner", "featured_products", "category_grid", "text"] as const;

const uuid = z.string().uuid();
const link = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/(?!\/)|https:\/\/)/, "Use um caminho interno (/...) ou um link https://");
const contentImageKey = z.string().regex(/^content\/[0-9a-f-]{36}\.(jpg|png|webp)$/, "Chave inválida");

const sectionBase = {
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().max(3000).nullable().optional(),
  ctaLabel: z.string().trim().max(40).nullable().optional(),
  ctaUrl: link.nullable().optional(),
  imageKey: contentImageKey.nullable().optional(),
  productIds: z.array(uuid).max(12).optional(),
  categoryIds: z.array(uuid).max(8).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
};

export const homeSectionCreateSchema = z
  .object({ kind: z.enum(HOME_SECTION_KINDS), ...sectionBase })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, message: string) => !ok && ctx.addIssue({ code: "custom", message });
    if (v.kind === "hero" || v.kind === "banner") need(!!v.title, "Informe o título.");
    if (v.kind === "featured_products") need((v.productIds?.length ?? 0) > 0, "Escolha ao menos 1 produto.");
    if (v.kind === "category_grid") need((v.categoryIds?.length ?? 0) > 0, "Escolha ao menos 1 categoria.");
    if (v.kind === "text") need(!!v.body, "Informe o texto.");
    if (v.ctaLabel) need(!!v.ctaUrl, "Informe o link do botão.");
    if (v.ctaUrl) need(!!v.ctaLabel, "Informe o texto do botão.");
  });
export const homeSectionUpdateSchema = z.object(sectionBase).partial();
