import { idsQuerySchema, mergeFavoritesSchema, storeProductsQuerySchema } from "@mavi/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { asyncHandler } from "../../lib/async";
import { authenticate } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import * as store from "./store.service";

export const storeRouter = Router();

// Dados públicos: cache curto (o estoque muda, então nada de cache longo).
const shortCache: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  next();
};

storeRouter.get("/home", shortCache, asyncHandler(async (_req, res) => { res.json(await store.getHome()); }));
storeRouter.get("/categories", shortCache, asyncHandler(async (_req, res) => { res.json(await store.listCategories()); }));
storeRouter.get("/locations", shortCache, asyncHandler(async (_req, res) => { res.json(await store.listLocations()); }));

storeRouter.get("/pages", shortCache, asyncHandler(async (_req, res) => { res.json(await store.listPublicPages()); }));
storeRouter.get("/pages/:slug", shortCache, asyncHandler(async (req, res) => {
  res.json(await store.getPublicPage(z.string().trim().min(1).max(80).parse(req.params["slug"])));
}));

storeRouter.get("/products", shortCache, asyncHandler(async (req, res) => {
  res.json(await store.listProducts(storeProductsQuerySchema.parse(req.query)));
}));
// Antes de "/products/:slug" para não ser capturada como slug.
storeRouter.get("/products/by-ids", asyncHandler(async (req, res) => {
  res.json(await store.cardsByIds(idsQuerySchema.parse(req.query).ids));
}));
storeRouter.get("/products/:slug", shortCache, asyncHandler(async (req, res) => {
  res.json(await store.getProductBySlug(z.string().trim().min(1).max(160).parse(req.params["slug"])));
}));

storeRouter.get("/sitemap.xml", asyncHandler(async (_req, res) => {
  if (!env.SITE_URL) throw new AppError(503, "site_url_pending", "SITE_URL pendente: defina o endereço público da loja.");
  res.type("application/xml").send(await store.buildSitemap(env.SITE_URL));
}));

// Favoritos da conta (exigem login; escritas passam pelo csrfGuard).
storeRouter.get("/favorites", authenticate, asyncHandler(async (req, res) => {
  res.json(await store.listFavorites(req.user!.id));
}));
storeRouter.post("/favorites/merge", authenticate, asyncHandler(async (req, res) => {
  await store.mergeFavorites(req.user!.id, mergeFavoritesSchema.parse(req.body).ids);
  res.json(await store.listFavorites(req.user!.id));
}));
storeRouter.put("/favorites/:productId", authenticate, asyncHandler(async (req, res) => {
  await store.addFavorite(req.user!.id, z.string().uuid().parse(req.params["productId"]));
  res.status(204).end();
}));
storeRouter.delete("/favorites/:productId", authenticate, asyncHandler(async (req, res) => {
  await store.removeFavorite(req.user!.id, z.string().uuid().parse(req.params["productId"]));
  res.status(204).end();
}));
