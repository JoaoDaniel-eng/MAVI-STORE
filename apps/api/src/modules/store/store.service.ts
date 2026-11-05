import type {
  Facets, HomeSectionView, ProductCard, ProductDetail, ProductListResponse, StoreCategory,
  StoreColor, StoreLocation, StoreProductsQuery, StoreSku,
} from "@mavi/shared";
import { pool } from "../../db/pool";
import { AppError } from "../../middleware/errors";

type R = Record<string, unknown>;
const LOW_STOCK_MAX = 3; // "últimas unidades" quando restam de 1 a 3
const QTY_CAP = 5;

const AVAILABLE_SKU = `EXISTS (SELECT 1 FROM stock_levels sl JOIN locations l ON l.id = sl.location_id
   WHERE sl.sku_id = s.id AND l.is_active AND sl.on_hand - sl.reserved > 0)`;

const CARD_COLUMNS = `
  p.id, p.slug, p.name, p.base_price_cents, p.compare_at_price_cents, c.name AS category_name,
  (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) AS cover_url,
  (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1 OFFSET 1) AS hover_url,
  COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('code', col.code, 'name', col.name, 'hex', col.hex))
              FROM skus s JOIN colors col ON col.id = s.color_id
             WHERE s.product_id = p.id AND s.is_active), '[]'::jsonb) AS colors,
  EXISTS (SELECT 1 FROM skus s WHERE s.product_id = p.id AND s.is_active AND ${AVAILABLE_SKU}) AS in_stock`;

// Só aparece na loja produto ativo, de categoria ativa e com ao menos uma variação ativa.
const VISIBLE = `p.status = 'active' AND c.is_active
  AND EXISTS (SELECT 1 FROM skus s WHERE s.product_id = p.id AND s.is_active)`;

const toCard = (r: R): ProductCard => ({
  id: r["id"] as string,
  slug: r["slug"] as string,
  name: r["name"] as string,
  basePriceCents: r["base_price_cents"] as number,
  compareAtPriceCents: (r["compare_at_price_cents"] as number | null) ?? null,
  categoryName: r["category_name"] as string,
  coverUrl: (r["cover_url"] as string | null) ?? null,
  hoverUrl: (r["hover_url"] as string | null) ?? null,
  colors: ((r["colors"] as StoreColor[]) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  inStock: Boolean(r["in_stock"]),
});

export async function cardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const { rows } = await pool.query<R>(
    `SELECT ${CARD_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.id = ANY($1::uuid[]) AND ${VISIBLE}`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r["id"] as string, toCard(r)]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])); // mantém a ordem pedida
}

export async function listCategories(): Promise<StoreCategory[]> {
  const { rows } = await pool.query<R>(
    `SELECT c.id, c.slug, c.name, c.parent_id,
            (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active')::int AS product_count
       FROM categories c WHERE c.is_active ORDER BY c.sort_order, c.name`,
  );
  return rows.map((r) => ({
    id: r["id"] as string, slug: r["slug"] as string, name: r["name"] as string,
    parentId: (r["parent_id"] as string | null) ?? null, productCount: r["product_count"] as number,
  }));
}

export async function listLocations(): Promise<StoreLocation[]> {
  const { rows } = await pool.query<R>(
    `SELECT code, name, shopping_name, store_number, city, state, address, phone, whatsapp,
            opening_hours, pickup_enabled, pickup_fee_cents
       FROM locations WHERE is_active ORDER BY sort_order`,
  );
  return rows.map((r) => ({
    code: r["code"] as string, name: r["name"] as string, shoppingName: r["shopping_name"] as string,
    storeNumber: r["store_number"] as string, city: r["city"] as string, state: r["state"] as string,
    address: (r["address"] as string | null) ?? null, phone: (r["phone"] as string | null) ?? null,
    whatsapp: (r["whatsapp"] as string | null) ?? null, openingHours: r["opening_hours"] ?? null,
    pickupEnabled: r["pickup_enabled"] as boolean, pickupFeeCents: r["pickup_fee_cents"] as number,
  }));
}

async function categoryIdsFor(slug: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM categories
      WHERE is_active AND (slug = $1 OR parent_id = (SELECT id FROM categories WHERE slug = $1 AND is_active))`,
    [slug],
  );
  if (!rows.length) throw new AppError(404, "not_found", "Categoria não encontrada.");
  return rows.map((r) => r.id);
}

const ORDER: Record<StoreProductsQuery["sort"], string> = {
  newest: "p.published_at DESC NULLS LAST, p.created_at DESC",
  price_asc: "p.base_price_cents ASC, p.id",
  price_desc: "p.base_price_cents DESC, p.id",
  name: "p.name ASC, p.id",
};

export async function listProducts(q: StoreProductsQuery): Promise<ProductListResponse> {
  const params: unknown[] = [];
  const push = (v: unknown) => (params.push(v), `$${params.length}`);

  // 1) Escopo (categoria + busca): base dos filtros disponíveis (facets).
  const scope: string[] = [];
  if (q.category) scope.push(`p.category_id = ANY(${push(await categoryIdsFor(q.category))}::uuid[])`);
  if (q.q) {
    const like = push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
    scope.push(`(p.name ILIKE ${like} OR p.code ILIKE ${like})`);
  }
  const scopeParams = params.slice();
  const scopeWhere = [VISIBLE, ...scope].join(" AND ");

  // 2) Filtros de variação: cor, tamanho e disponibilidade valem para a MESMA variação.
  const sku = ["s.product_id = p.id", "s.is_active"];
  if (q.color?.length) sku.push(`s.color_id IN (SELECT id FROM colors WHERE code = ANY(${push(q.color.map((c) => c.toUpperCase()))}::text[]))`);
  if (q.size?.length) sku.push(`s.size_id IN (SELECT id FROM sizes WHERE label = ANY(${push(q.size)}::text[]))`);
  if (q.inStock) sku.push(AVAILABLE_SKU);

  const where = [scopeWhere, `EXISTS (SELECT 1 FROM skus s WHERE ${sku.join(" AND ")})`];
  if (q.minPrice !== undefined) where.push(`p.base_price_cents >= ${push(q.minPrice)}`);
  if (q.maxPrice !== undefined) where.push(`p.base_price_cents <= ${push(q.maxPrice)}`);

  const limit = push(q.pageSize);
  const offset = push((q.page - 1) * q.pageSize);

  const facetFrom = `FROM products p JOIN categories c ON c.id = p.category_id
      JOIN skus s ON s.product_id = p.id AND s.is_active`;

  const [list, colors, sizes, price] = await Promise.all([
    pool.query<R>(
      `SELECT ${CARD_COLUMNS}, count(*) OVER() AS total
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(" AND ")} ORDER BY ${ORDER[q.sort]} LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    pool.query<R>(
      `SELECT col.code, col.name, col.hex, count(DISTINCT p.id)::int AS count
         ${facetFrom} JOIN colors col ON col.id = s.color_id
        WHERE ${scopeWhere} GROUP BY col.id ORDER BY col.name`,
      scopeParams,
    ),
    pool.query<R>(
      `SELECT z.label, count(DISTINCT p.id)::int AS count
         ${facetFrom} JOIN sizes z ON z.id = s.size_id
        WHERE ${scopeWhere} GROUP BY z.id ORDER BY z.sort_order, z.label`,
      scopeParams,
    ),
    pool.query<R>(
      `SELECT min(p.base_price_cents) AS min_cents, max(p.base_price_cents) AS max_cents
         FROM products p JOIN categories c ON c.id = p.category_id WHERE ${scopeWhere}`,
      scopeParams,
    ),
  ]);

  const facets: Facets = {
    colors: colors.rows.map((r) => ({ code: r["code"] as string, name: r["name"] as string, hex: r["hex"] as string, count: r["count"] as number })),
    sizes: sizes.rows.map((r) => ({ label: r["label"] as string, count: r["count"] as number })),
    price: {
      minCents: (price.rows[0]?.["min_cents"] as number | null) ?? null,
      maxCents: (price.rows[0]?.["max_cents"] as number | null) ?? null,
    },
  };
  return {
    total: list.rows[0] ? Number(list.rows[0]["total"]) : 0,
    page: q.page,
    pageSize: q.pageSize,
    items: list.rows.map(toCard),
    facets,
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail> {
  const { rows } = await pool.query<R>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            g.name AS guide_name, g.description AS guide_description, g.notes AS guide_notes,
            g.columns AS guide_columns, g.rows AS guide_rows
       FROM products p JOIN categories c ON c.id = p.category_id
       LEFT JOIN size_guides g ON g.id = p.size_guide_id
      WHERE p.slug = $1 AND ${VISIBLE}`,
    [slug],
  );
  const p = rows[0];
  if (!p) throw new AppError(404, "not_found", "Produto não encontrado.");
  const id = p["id"] as string;

  const [skuRows, imgRows, related] = await Promise.all([
    pool.query<R>(
      `SELECT s.id, s.sku_code, COALESCE(s.price_cents, p.base_price_cents) AS price_cents,
              col.code AS color_code, col.name AS color_name, col.hex AS color_hex, z.label AS size_label, z.sort_order,
              COALESCE(a.total, 0)::int AS available, COALESCE(a.pickup, '{}') AS pickup
         FROM skus s JOIN products p ON p.id = s.product_id
         JOIN colors col ON col.id = s.color_id JOIN sizes z ON z.id = s.size_id
         LEFT JOIN LATERAL (
           SELECT sum(sl.on_hand - sl.reserved) AS total,
                  array_agg(l.code ORDER BY l.sort_order) FILTER (WHERE l.pickup_enabled AND sl.on_hand - sl.reserved > 0) AS pickup
             FROM stock_levels sl JOIN locations l ON l.id = sl.location_id
            WHERE sl.sku_id = s.id AND l.is_active
         ) a ON true
        WHERE s.product_id = $1 AND s.is_active ORDER BY col.name, z.sort_order`,
      [id],
    ),
    pool.query<R>(
      `SELECT i.id, i.url, i.alt, col.code AS color_code FROM product_images i
         LEFT JOIN colors col ON col.id = i.color_id WHERE i.product_id = $1 ORDER BY i.sort_order, i.created_at`,
      [id],
    ),
    pool.query<R>(
      `SELECT ${CARD_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.category_id = $1 AND p.id <> $2 AND ${VISIBLE}
        ORDER BY p.published_at DESC NULLS LAST LIMIT 4`,
      [p["category_id"], id],
    ),
  ]);

  const rv = (await pool.query<{ n: number; avg: number | null }>(
    `SELECT count(*)::int AS n, avg(rating)::float AS avg FROM reviews WHERE product_id = $1 AND status = 'approved'`, [id],
  )).rows[0];
  const colorMap = new Map<string, StoreColor>();
  const sizes: string[] = [];
  const skus: StoreSku[] = skuRows.rows.map((r) => {
    colorMap.set(r["color_code"] as string, { code: r["color_code"] as string, name: r["color_name"] as string, hex: r["color_hex"] as string });
    if (!sizes.includes(r["size_label"] as string)) sizes.push(r["size_label"] as string);
    const available = r["available"] as number;
    return {
      id: r["id"] as string, skuCode: r["sku_code"] as string, colorCode: r["color_code"] as string,
      sizeLabel: r["size_label"] as string, priceCents: r["price_cents"] as number,
      available: Math.min(available, QTY_CAP), inStock: available > 0,
      lowStock: available > 0 && available <= LOW_STOCK_MAX, pickupLocations: (r["pickup"] as string[]) ?? [],
    };
  });

  return {
    id, slug: p["slug"] as string, code: p["code"] as string, name: p["name"] as string,
    description: (p["description"] as string | null) ?? null, composition: (p["composition"] as string | null) ?? null,
    careInstructions: (p["care_instructions"] as string | null) ?? null,
    categoryName: p["category_name"] as string, categorySlug: p["category_slug"] as string,
    basePriceCents: p["base_price_cents"] as number, compareAtPriceCents: (p["compare_at_price_cents"] as number | null) ?? null,
    seoTitle: (p["seo_title"] as string | null) ?? null, seoDescription: (p["seo_description"] as string | null) ?? null,
    images: imgRows.rows.map((r) => ({ id: r["id"] as string, url: r["url"] as string, alt: r["alt"] as string, colorCode: (r["color_code"] as string | null) ?? null })),
    colors: [...colorMap.values()], sizes, skus,
    sizeGuide: p["guide_name"]
      ? { name: p["guide_name"] as string, description: (p["guide_description"] as string | null) ?? null,
          notes: (p["guide_notes"] as string | null) ?? null, columns: p["guide_columns"] as string[], rows: p["guide_rows"] as string[][] }
      : null,
    related: related.rows.map(toCard),
    rating: rv && rv.n > 0 && rv.avg !== null ? { average: Math.round(rv.avg * 10) / 10, count: rv.n } : null,
  };
}

export async function getHome(): Promise<HomeSectionView[]> {
  const { rows } = await pool.query<R>(`SELECT * FROM home_sections WHERE is_active ORDER BY sort_order, created_at`);
  const out: HomeSectionView[] = [];
  for (const r of rows) {
    const products = r["kind"] === "featured_products" ? await cardsByIds(r["product_ids"] as string[]) : [];
    let categories: HomeSectionView["categories"] = [];
    if (r["kind"] === "category_grid") {
      const cats = await pool.query<R>(
        `SELECT c.id, c.slug, c.name,
                (SELECT i.url FROM products p JOIN product_images i ON i.product_id = p.id
                  WHERE p.category_id = c.id AND p.status = 'active' ORDER BY i.sort_order, i.created_at LIMIT 1) AS cover_url
           FROM categories c WHERE c.is_active AND c.id = ANY($1::uuid[])`,
        [r["category_ids"]],
      );
      const order = r["category_ids"] as string[];
      categories = cats.rows
        .map((c) => ({ id: c["id"] as string, slug: c["slug"] as string, name: c["name"] as string, coverUrl: (c["cover_url"] as string | null) ?? null }))
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    out.push({
      id: r["id"] as string, kind: r["kind"] as HomeSectionView["kind"],
      title: (r["title"] as string | null) ?? null, subtitle: (r["subtitle"] as string | null) ?? null,
      body: (r["body"] as string | null) ?? null, ctaLabel: (r["cta_label"] as string | null) ?? null,
      ctaUrl: (r["cta_url"] as string | null) ?? null, imageUrl: (r["image_url"] as string | null) ?? null,
      products, categories,
    });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function buildSitemap(siteUrl: string): Promise<string> {
  const base = siteUrl.replace(/\/$/, "");
  const urls: Array<{ loc: string; lastmod?: string }> = [{ loc: "/" }, { loc: "/catalogo" }];
  const cats = await pool.query<R>(`SELECT slug FROM categories WHERE is_active ORDER BY slug`);
  cats.rows.forEach((c) => urls.push({ loc: `/categoria/${c["slug"]}` }));
  const pgs = await pool.query<R>(`SELECT slug FROM pages WHERE is_published ORDER BY slug`);
  pgs.rows.forEach((p) => urls.push({ loc: `/p/${p["slug"]}` }));
  const prods = await pool.query<R>(
    `SELECT p.slug, p.updated_at FROM products p JOIN categories c ON c.id = p.category_id WHERE ${VISIBLE} ORDER BY p.slug`,
  );
  prods.rows.forEach((p) => urls.push({ loc: `/produto/${p["slug"]}`, lastmod: (p["updated_at"] as Date).toISOString() }));
  const body = urls
    .map((u) => `  <url><loc>${esc(base + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export async function listFavorites(userId: string) {
  const { rows } = await pool.query<{ product_id: string }>(
    `SELECT product_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return cardsByIds(rows.map((r) => r.product_id));
}

export async function addFavorite(userId: string, productId: string) {
  const ok = await cardsByIds([productId]);
  if (!ok.length) throw new AppError(404, "not_found", "Produto não encontrado.");
  await pool.query(`INSERT INTO favorites (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, productId]);
}

export async function removeFavorite(userId: string, productId: string) {
  await pool.query(`DELETE FROM favorites WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
}

/** Junta os favoritos do aparelho aos da conta (após o login). Ignora produtos que não estão à venda. */
export async function mergeFavorites(userId: string, ids: string[]) {
  if (!ids.length) return;
  const visible = await cardsByIds(ids);
  for (const p of visible) {
    await pool.query(`INSERT INTO favorites (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, p.id]);
  }
}

export async function listPublicPages() {
  const { rows } = await pool.query<R>(`SELECT slug, title, show_in_footer FROM pages WHERE is_published ORDER BY sort_order, title`);
  return rows.map((r) => ({ slug: r["slug"] as string, title: r["title"] as string, showInFooter: r["show_in_footer"] as boolean }));
}

export async function getPublicPage(slug: string) {
  const r = (await pool.query<R>(`SELECT slug, title, body, seo_description FROM pages WHERE slug = $1 AND is_published`, [slug])).rows[0];
  if (!r) throw new AppError(404, "not_found", "Página não encontrada.");
  return { slug: r["slug"] as string, title: r["title"] as string, body: r["body"] as string, seoDescription: (r["seo_description"] as string | null) ?? null };
}
