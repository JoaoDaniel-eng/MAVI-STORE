import type { PoolClient } from "pg";
import type { z } from "zod";
import type {
  imageRegisterSchema,
  imageUpdateSchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  skuGenerateSchema,
  skuUpdateSchema,
} from "@mavi/shared";
import { pool, withTransaction } from "../../db/pool";
import { slugify } from "../../lib/slug";
import { assertObjectExists, deleteObject, publicUrlFor } from "../../lib/storage";
import { AppError } from "../../middleware/errors";
import { writeAudit, type AuditCtx } from "../audit/audit.service";
import { buildUpdate, camel, mapPgError, type Row } from "./crud";

const MAX_IMAGES = 12;

async function mustExist(c: PoolClient, table: string, id: string, label: string) {
  const { rowCount } = await c.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (!rowCount) throw new AppError(400, "invalid_reference", `${label} não encontrado(a).`);
}

/** Produto só vira "active" com preço, dados de frete, imagem e ao menos uma variação ativa. */
async function assertPublishable(c: PoolClient, p: Row) {
  const missing: string[] = [];
  if (!((p["base_price_cents"] as number) > 0)) missing.push("preço");
  if (!p["weight_g"]) missing.push("peso");
  if (!p["length_cm"] || !p["width_cm"] || !p["height_cm"]) missing.push("dimensões");
  const id = p["id"] as string;
  const imgs = await c.query(`SELECT 1 FROM product_images WHERE product_id = $1 LIMIT 1`, [id]);
  if (!imgs.rowCount) missing.push("ao menos 1 imagem");
  const skus = await c.query(`SELECT 1 FROM skus WHERE product_id = $1 AND is_active LIMIT 1`, [id]);
  if (!skus.rowCount) missing.push("ao menos 1 variação (SKU) ativa");
  if (missing.length) throw new AppError(422, "not_publishable", `Para publicar falta: ${missing.join(", ")}.`);
}

export async function listProducts(q: z.infer<typeof productListQuerySchema>) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.status) add("p.status = ?", q.status);
  if (q.categoryId) add("p.category_id = ?", q.categoryId);
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
  }
  params.push(q.limit, q.offset);
  const whereSql = where.join(" AND ");
  const { rows } = await pool.query<Row>(
    `SELECT p.id, p.code, p.slug, p.name, p.status, p.base_price_cents, p.category_id,
            c.name AS category_name,
            (SELECT count(*) FROM skus s WHERE s.product_id = p.id) AS sku_count,
            (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) AS cover_url,
            p.updated_at, count(*) OVER() AS total
       FROM products p JOIN categories c ON c.id = p.category_id
       ${whereSql ? "WHERE " + whereSql : ""}
      ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0] ? Number(rows[0]["total"]) : 0,
    items: rows.map((r) => {
      const { total: _t, ...rest } = camel(r);
      return { ...rest, skuCount: Number(rest["skuCount"]) };
    }),
  };
}

export async function getProduct(id: string) {
  const product = (await pool.query<Row>(`SELECT * FROM products WHERE id = $1`, [id])).rows[0];
  if (!product) throw new AppError(404, "not_found", "Produto não encontrado.");
  const skus = await pool.query<Row>(
    `SELECT s.*, c.name AS color_name, c.hex AS color_hex, z.label AS size_label
       FROM skus s JOIN colors c ON c.id = s.color_id JOIN sizes z ON z.id = s.size_id
      WHERE s.product_id = $1 ORDER BY c.name, z.sort_order`,
    [id],
  );
  const images = await pool.query<Row>(
    `SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at`,
    [id],
  );
  return { ...camel(product), skus: skus.rows.map(camel), images: images.rows.map(camel) };
}

export async function createProduct(input: z.infer<typeof productCreateSchema>, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      await mustExist(c, "categories", input.categoryId, "Categoria");
      if (input.sizeGuideId) await mustExist(c, "size_guides", input.sizeGuideId, "Guia de medidas");
      if (input.compareAtPriceCents != null && input.compareAtPriceCents <= input.basePriceCents) {
        throw new AppError(422, "invalid_value", "O preço 'de' precisa ser maior que o preço atual.");
      }
      const { rows } = await c.query<Row>(
        `INSERT INTO products (code, slug, name, description, composition, care_instructions, category_id, size_guide_id,
            base_price_cents, compare_at_price_cents, weight_g, length_cm, width_cm, height_cm, seo_title, seo_description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          input.code, input.slug ?? slugify(input.name), input.name, input.description ?? null,
          input.composition ?? null, input.careInstructions ?? null, input.categoryId, input.sizeGuideId ?? null,
          input.basePriceCents, input.compareAtPriceCents ?? null, input.weightG ?? null,
          input.lengthCm ?? null, input.widthCm ?? null, input.heightCm ?? null,
          input.seoTitle ?? null, input.seoDescription ?? null,
        ],
      );
      const row = camel(rows[0]!);
      await writeAudit(c, ctx, { action: "product.create", entity: "product", entityId: String(row["id"]), after: row });
      return row;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function updateProduct(id: string, p: z.infer<typeof productUpdateSchema>, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      const before = (await c.query<Row>(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new AppError(404, "not_found", "Produto não encontrado.");

      if (p.categoryId) await mustExist(c, "categories", p.categoryId, "Categoria");
      if (p.sizeGuideId) await mustExist(c, "size_guides", p.sizeGuideId, "Guia de medidas");

      const fields: Row = {
        code: p.code, slug: p.slug, name: p.name, description: p.description, composition: p.composition,
        care_instructions: p.careInstructions, category_id: p.categoryId, size_guide_id: p.sizeGuideId,
        base_price_cents: p.basePriceCents, compare_at_price_cents: p.compareAtPriceCents, weight_g: p.weightG,
        length_cm: p.lengthCm, width_cm: p.widthCm, height_cm: p.heightCm, seo_title: p.seoTitle,
        seo_description: p.seoDescription, status: p.status,
      };
      const merged: Row = { ...before };
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) merged[k] = v;

      const base = merged["base_price_cents"] as number;
      const compare = merged["compare_at_price_cents"] as number | null;
      if (compare != null && compare <= base) {
        throw new AppError(422, "invalid_value", "O preço 'de' precisa ser maior que o preço atual.");
      }
      if (merged["status"] === "active") {
        await assertPublishable(c, merged);
        if (!before["published_at"]) fields["published_at"] = new Date();
      }

      const { sql, params } = buildUpdate("products", id, fields);
      const after = camel((await c.query<Row>(sql, params)).rows[0]!);
      await writeAudit(c, ctx, { action: "product.update", entity: "product", entityId: id, before: camel(before), after });
      return after;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

/** Gera as variações (cor × tamanho) que ainda não existem. */
export async function generateSkus(productId: string, input: z.infer<typeof skuGenerateSchema>, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      const product = (await c.query<Row>(`SELECT id, code FROM products WHERE id = $1 FOR UPDATE`, [productId])).rows[0];
      if (!product) throw new AppError(404, "not_found", "Produto não encontrado.");

      const colorIds = [...new Set(input.colorIds)];
      const sizeIds = [...new Set(input.sizeIds)];
      const colors = (await c.query<Row>(`SELECT id, code FROM colors WHERE id = ANY($1::uuid[])`, [colorIds])).rows;
      const sizes = (await c.query<Row>(`SELECT id, label FROM sizes WHERE id = ANY($1::uuid[])`, [sizeIds])).rows;
      if (colors.length !== colorIds.length || sizes.length !== sizeIds.length) {
        throw new AppError(400, "invalid_reference", "Cor ou tamanho não encontrado.");
      }

      const created: Row[] = [];
      for (const color of colors) {
        for (const size of sizes) {
          const code = `${product["code"]}-${color["code"]}-${String(size["label"]).toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
          const { rows } = await c.query<Row>(
            `INSERT INTO skus (product_id, color_id, size_id, sku_code, price_cents)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (product_id, color_id, size_id) DO NOTHING RETURNING *`,
            [productId, color["id"], size["id"], code, input.priceCents ?? null],
          );
          if (rows[0]) created.push(camel(rows[0]));
        }
      }
      await writeAudit(c, ctx, {
        action: "sku.generate", entity: "product", entityId: productId,
        after: { created: created.length, skipped: colors.length * sizes.length - created.length },
      });
      return { created, skipped: colors.length * sizes.length - created.length };
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function updateSku(id: string, p: z.infer<typeof skuUpdateSchema>, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      const before = (await c.query<Row>(`SELECT * FROM skus WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new AppError(404, "not_found", "SKU não encontrado.");
      const { sql, params } = buildUpdate("skus", id, {
        sku_code: p.skuCode, barcode: p.barcode, price_cents: p.priceCents, is_active: p.isActive,
      });
      const after = camel((await c.query<Row>(sql, params)).rows[0]!);
      await writeAudit(c, ctx, { action: "sku.update", entity: "sku", entityId: id, before: camel(before), after });
      return after;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function deleteSku(id: string, ctx: AuditCtx) {
  try {
    await withTransaction(async (c) => {
      const { rows } = await c.query<Row>(`DELETE FROM skus WHERE id = $1 RETURNING *`, [id]);
      if (!rows[0]) throw new AppError(404, "not_found", "SKU não encontrado.");
      await writeAudit(c, ctx, { action: "sku.delete", entity: "sku", entityId: id, before: camel(rows[0]) });
    });
  } catch (e) {
    throw mapPgError(e); // com estoque/pedidos (fases futuras) a FK impede: desative o SKU
  }
}

export async function registerImage(productId: string, input: z.infer<typeof imageRegisterSchema>, ctx: AuditCtx) {
  await assertObjectExists(input.key);
  try {
    return await withTransaction(async (c) => {
      await mustExist(c, "products", productId, "Produto");
      if (input.colorId) await mustExist(c, "colors", input.colorId, "Cor");
      const count = Number((await c.query(`SELECT count(*) FROM product_images WHERE product_id = $1`, [productId])).rows[0]!["count"]);
      if (count >= MAX_IMAGES) throw new AppError(422, "too_many_images", `Máximo de ${MAX_IMAGES} imagens por produto.`);
      const { rows } = await c.query<Row>(
        `INSERT INTO product_images (product_id, color_id, storage_key, url, alt, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [productId, input.colorId ?? null, input.key, publicUrlFor(input.key), input.alt, input.sortOrder ?? count],
      );
      const row = camel(rows[0]!);
      await writeAudit(c, ctx, { action: "product_image.create", entity: "product_image", entityId: String(row["id"]), after: row });
      return row;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function updateImage(id: string, p: z.infer<typeof imageUpdateSchema>, ctx: AuditCtx) {
  try {
    return await withTransaction(async (c) => {
      const before = (await c.query<Row>(`SELECT * FROM product_images WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new AppError(404, "not_found", "Imagem não encontrada.");
      if (p.colorId) await mustExist(c, "colors", p.colorId, "Cor");
      const { sql, params } = buildUpdate("product_images", id, { alt: p.alt, color_id: p.colorId, sort_order: p.sortOrder });
      const after = camel((await c.query<Row>(sql, params)).rows[0]!);
      await writeAudit(c, ctx, { action: "product_image.update", entity: "product_image", entityId: id, before: camel(before), after });
      return after;
    });
  } catch (e) {
    throw mapPgError(e);
  }
}

export async function deleteImage(id: string, ctx: AuditCtx) {
  const key = await withTransaction(async (c) => {
    const { rows } = await c.query<Row>(`DELETE FROM product_images WHERE id = $1 RETURNING *`, [id]);
    if (!rows[0]) throw new AppError(404, "not_found", "Imagem não encontrada.");
    await writeAudit(c, ctx, { action: "product_image.delete", entity: "product_image", entityId: id, before: camel(rows[0]) });
    return rows[0]["storage_key"] as string;
  });
  await deleteObject(key); // só depois do commit; falha aqui não desfaz o registro
}
