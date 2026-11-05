import {
  categoryCreateSchema, categoryUpdateSchema, colorCreateSchema, colorUpdateSchema,
  imageRegisterSchema, imageUpdateSchema, presignSchema, productCreateSchema, productListQuerySchema,
  productUpdateSchema, sizeCreateSchema, sizeGuideCreateSchema, sizeGuideUpdateSchema, sizeUpdateSchema,
  skuGenerateSchema, skuUpdateSchema,
} from "@mavi/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { slugify } from "../../lib/slug";
import { presignImageUpload } from "../../lib/storage";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { createRow, deleteRow, listRows, updateRow } from "./crud";
import * as products from "./products.service";
import { categories, checkCategoryParent, colors, sizeGuides, sizes } from "./taxonomy.service";

export const catalogRouter = Router();
catalogRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

const read = requirePermission("catalog.read");
const manage = requirePermission("catalog.manage");
const idOf = (req: Request) => z.string().uuid().parse(req.params["id"]);
const json = (v: unknown) => (v === undefined ? undefined : JSON.stringify(v));

/* Categorias */
catalogRouter.get("/categories", read, asyncHandler(async (_req, res) => { res.json(await listRows(categories)); }));
catalogRouter.post("/categories", manage, asyncHandler(async (req, res) => {
  const i = categoryCreateSchema.parse(req.body);
  res.status(201).json(await createRow(categories, {
    name: i.name, slug: i.slug ?? slugify(i.name), parent_id: i.parentId ?? null,
    description: i.description ?? null, sort_order: i.sortOrder ?? 0, is_active: i.isActive ?? true,
  }, auditCtx(req), checkCategoryParent(null, i.parentId)));
}));
catalogRouter.patch("/categories/:id", manage, asyncHandler(async (req, res) => {
  const id = idOf(req); const i = categoryUpdateSchema.parse(req.body);
  res.json(await updateRow(categories, id, {
    name: i.name, slug: i.slug, parent_id: i.parentId, description: i.description,
    sort_order: i.sortOrder, is_active: i.isActive,
  }, auditCtx(req), checkCategoryParent(id, i.parentId)));
}));
catalogRouter.delete("/categories/:id", manage, asyncHandler(async (req, res) => {
  await deleteRow(categories, idOf(req), auditCtx(req)); res.status(204).end();
}));

/* Cores */
catalogRouter.get("/colors", read, asyncHandler(async (_req, res) => { res.json(await listRows(colors)); }));
catalogRouter.post("/colors", manage, asyncHandler(async (req, res) => {
  const i = colorCreateSchema.parse(req.body);
  res.status(201).json(await createRow(colors, { code: i.code, name: i.name, hex: i.hex }, auditCtx(req)));
}));
catalogRouter.patch("/colors/:id", manage, asyncHandler(async (req, res) => {
  const i = colorUpdateSchema.parse(req.body);
  res.json(await updateRow(colors, idOf(req), { code: i.code, name: i.name, hex: i.hex }, auditCtx(req)));
}));
catalogRouter.delete("/colors/:id", manage, asyncHandler(async (req, res) => {
  await deleteRow(colors, idOf(req), auditCtx(req)); res.status(204).end();
}));

/* Tamanhos */
catalogRouter.get("/sizes", read, asyncHandler(async (_req, res) => { res.json(await listRows(sizes)); }));
catalogRouter.post("/sizes", manage, asyncHandler(async (req, res) => {
  const i = sizeCreateSchema.parse(req.body);
  res.status(201).json(await createRow(sizes, { label: i.label, sort_order: i.sortOrder ?? 0 }, auditCtx(req)));
}));
catalogRouter.patch("/sizes/:id", manage, asyncHandler(async (req, res) => {
  const i = sizeUpdateSchema.parse(req.body);
  res.json(await updateRow(sizes, idOf(req), { label: i.label, sort_order: i.sortOrder }, auditCtx(req)));
}));
catalogRouter.delete("/sizes/:id", manage, asyncHandler(async (req, res) => {
  await deleteRow(sizes, idOf(req), auditCtx(req)); res.status(204).end();
}));

/* Guias de medidas */
catalogRouter.get("/size-guides", read, asyncHandler(async (_req, res) => { res.json(await listRows(sizeGuides)); }));
catalogRouter.post("/size-guides", manage, asyncHandler(async (req, res) => {
  const i = sizeGuideCreateSchema.parse(req.body);
  res.status(201).json(await createRow(sizeGuides, {
    name: i.name, description: i.description ?? null, notes: i.notes ?? null,
    columns: JSON.stringify(i.columns), rows: JSON.stringify(i.rows),
  }, auditCtx(req)));
}));
catalogRouter.patch("/size-guides/:id", manage, asyncHandler(async (req, res) => {
  const i = sizeGuideUpdateSchema.parse(req.body);
  res.json(await updateRow(sizeGuides, idOf(req), {
    name: i.name, description: i.description, notes: i.notes, columns: json(i.columns), rows: json(i.rows),
  }, auditCtx(req)));
}));
catalogRouter.delete("/size-guides/:id", manage, asyncHandler(async (req, res) => {
  await deleteRow(sizeGuides, idOf(req), auditCtx(req)); res.status(204).end();
}));

/* Produtos */
catalogRouter.get("/products", read, asyncHandler(async (req, res) => {
  res.json(await products.listProducts(productListQuerySchema.parse(req.query)));
}));
catalogRouter.get("/products/:id", read, asyncHandler(async (req, res) => {
  res.json(await products.getProduct(idOf(req)));
}));
catalogRouter.post("/products", manage, asyncHandler(async (req, res) => {
  res.status(201).json(await products.createProduct(productCreateSchema.parse(req.body), auditCtx(req)));
}));
catalogRouter.patch("/products/:id", manage, asyncHandler(async (req, res) => {
  res.json(await products.updateProduct(idOf(req), productUpdateSchema.parse(req.body), auditCtx(req)));
}));

/* SKUs */
catalogRouter.post("/products/:id/skus/generate", manage, asyncHandler(async (req, res) => {
  res.status(201).json(await products.generateSkus(idOf(req), skuGenerateSchema.parse(req.body), auditCtx(req)));
}));
catalogRouter.patch("/skus/:id", manage, asyncHandler(async (req, res) => {
  res.json(await products.updateSku(idOf(req), skuUpdateSchema.parse(req.body), auditCtx(req)));
}));
catalogRouter.delete("/skus/:id", manage, asyncHandler(async (req, res) => {
  await products.deleteSku(idOf(req), auditCtx(req)); res.status(204).end();
}));

/* Imagens: 1) presign  2) PUT direto no storage  3) registrar */
catalogRouter.post("/uploads/presign", manage, asyncHandler(async (req, res) => {
  const i = presignSchema.parse(req.body);
  res.json(await presignImageUpload(i.contentType, i.size, i.purpose));
}));
catalogRouter.post("/products/:id/images", manage, asyncHandler(async (req, res) => {
  res.status(201).json(await products.registerImage(idOf(req), imageRegisterSchema.parse(req.body), auditCtx(req)));
}));
catalogRouter.patch("/images/:id", manage, asyncHandler(async (req, res) => {
  res.json(await products.updateImage(idOf(req), imageUpdateSchema.parse(req.body), auditCtx(req)));
}));
catalogRouter.delete("/images/:id", manage, asyncHandler(async (req, res) => {
  await products.deleteImage(idOf(req), auditCtx(req)); res.status(204).end();
}));
