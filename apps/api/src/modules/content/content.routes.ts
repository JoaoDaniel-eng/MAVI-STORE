import { homeSectionCreateSchema, homeSectionUpdateSchema, pageCreateSchema, pageUpdateSchema } from "@mavi/shared";
import { slugify } from "../../lib/slug";
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async";
import { assertObjectExists, publicUrlFor } from "../../lib/storage";
import { authenticate, requirePermission } from "../../middleware/auth";
import { adminLimiter } from "../../middleware/rateLimits";
import { auditCtx } from "../audit/audit.service";
import { camel, createRow, deleteRow, listRows, updateRow, type Def } from "../catalog/crud";

const homeSections: Def = { table: "home_sections", entity: "home_section", order: "sort_order, created_at" };

const pages: Def = { table: "pages", entity: "page", order: "sort_order, title" };

export const contentRouter = Router();
contentRouter.use(authenticate, requirePermission("panel.access"), adminLimiter);

const idOf = (req: Request) => z.string().uuid().parse(req.params["id"]);

contentRouter.get("/home-sections", requirePermission("content.read"), asyncHandler(async (_req, res) => {
  res.json(await listRows(homeSections));
}));

contentRouter.post("/home-sections", requirePermission("content.manage"), asyncHandler(async (req, res) => {
  const i = homeSectionCreateSchema.parse(req.body);
  if (i.imageKey) await assertObjectExists(i.imageKey);
  const row = await createRow(homeSections, {
    kind: i.kind, title: i.title ?? null, subtitle: i.subtitle ?? null, body: i.body ?? null,
    cta_label: i.ctaLabel ?? null, cta_url: i.ctaUrl ?? null,
    image_key: i.imageKey ?? null, image_url: i.imageKey ? publicUrlFor(i.imageKey) : null,
    product_ids: i.productIds ?? [], category_ids: i.categoryIds ?? [],
    sort_order: i.sortOrder ?? 0, is_active: i.isActive ?? true,
  }, auditCtx(req));
  res.status(201).json(camel(row));
}));

contentRouter.patch("/home-sections/:id", requirePermission("content.manage"), asyncHandler(async (req, res) => {
  const i = homeSectionUpdateSchema.parse(req.body);
  if (i.imageKey) await assertObjectExists(i.imageKey);
  res.json(await updateRow(homeSections, idOf(req), {
    title: i.title, subtitle: i.subtitle, body: i.body, cta_label: i.ctaLabel, cta_url: i.ctaUrl,
    image_key: i.imageKey,
    image_url: i.imageKey === undefined ? undefined : i.imageKey ? publicUrlFor(i.imageKey) : null,
    product_ids: i.productIds, category_ids: i.categoryIds, sort_order: i.sortOrder, is_active: i.isActive,
  }, auditCtx(req)));
}));

contentRouter.delete("/home-sections/:id", requirePermission("content.manage"), asyncHandler(async (req, res) => {
  await deleteRow(homeSections, idOf(req), auditCtx(req));
  res.status(204).end();
}));

/* Páginas institucionais (termos, privacidade, trocas, sobre…) */
contentRouter.get("/pages", requirePermission("content.read"), asyncHandler(async (_req, res) => { res.json(await listRows(pages)); }));

contentRouter.post("/pages", requirePermission("content.manage"), asyncHandler(async (req, res) => {
  const i = pageCreateSchema.parse(req.body);
  res.status(201).json(await createRow(pages, {
    slug: i.slug ?? slugify(i.title), title: i.title, body: i.body, seo_description: i.seoDescription ?? null,
    sort_order: i.sortOrder ?? 0, is_published: i.isPublished ?? false, show_in_footer: i.showInFooter ?? true,
  }, auditCtx(req)));
}));

contentRouter.patch("/pages/:id", requirePermission("content.manage"), asyncHandler(async (req, res) => {
  const i = pageUpdateSchema.parse(req.body);
  res.json(await updateRow(pages, idOf(req), {
    slug: i.slug, title: i.title, body: i.body, seo_description: i.seoDescription, sort_order: i.sortOrder,
    is_published: i.isPublished, show_in_footer: i.showInFooter,
  }, auditCtx(req)));
}));

contentRouter.delete("/pages/:id", requirePermission("content.manage"), asyncHandler(async (req, res) => {
  await deleteRow(pages, idOf(req), auditCtx(req));
  res.status(204).end();
}));
