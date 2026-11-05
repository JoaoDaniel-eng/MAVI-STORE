import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import { csrfGuard } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/errors";
import { healthRouter } from "./routes/health";
import { auditRouter } from "./modules/audit/audit.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { contentRouter } from "./modules/content/content.routes";
import { storeRouter } from "./modules/store/store.routes";
import { checkoutRouter } from "./modules/checkout/checkout.routes";
import { couponsRouter } from "./modules/coupons/coupons.routes";
import { locationsRouter } from "./modules/settings/locations.routes";
import { adminPaymentsRouter, storePaymentsRouter, webhooksRouter } from "./modules/payments/payments.routes";
import { accountRouter } from "./modules/account/account.routes";
import { adminOrdersRouter } from "./modules/orders/orders.admin.routes";
import { adminReviewsRouter, storeReviewsRouter } from "./modules/reviews/reviews.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { adminPrivacyRouter } from "./modules/privacy/privacy.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { stockRouter } from "./modules/stock/stock.routes";
import { adminUsersRouter } from "./modules/users/users.routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // atrás do proxy do Render

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.use("/api", healthRouter);

  // Webhooks dos gateways: sem cookie, por isso ficam antes do csrfGuard.
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api", csrfGuard);
  app.use("/api/auth", authRouter);
  app.use("/api/admin/users", adminUsersRouter);
  app.use("/api/admin/audit-log", auditRouter);
  app.use("/api/admin/catalog", catalogRouter);
  app.use("/api/admin/stock", stockRouter);
  app.use("/api/admin/settings", settingsRouter);
  app.use("/api/admin/content", contentRouter);
  app.use("/api/admin/reports", reportsRouter);
  app.use("/api/admin/privacy", adminPrivacyRouter);
  app.use("/api/store", storeRouter);
  app.use("/api/store", checkoutRouter);
  app.use("/api/store", storePaymentsRouter);
  app.use("/api/store", storeReviewsRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/admin/orders", adminOrdersRouter);
  app.use("/api/admin/reviews", adminReviewsRouter);
  app.use("/api/admin/payments", adminPaymentsRouter);
  app.use("/api/admin/coupons", couponsRouter);
  app.use("/api/admin/locations", locationsRouter);
  app.use("/api/admin", dashboardRouter); // por último: seu middleware vale para tudo sob /api/admin que chegar até aqui

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
