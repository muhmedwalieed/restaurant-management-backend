import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import env from "../config/env.js";
import routes from "../routes/index.js";
import healthRouter from "../routes/health.routes.js";
import { UPLOADS_DIR } from "../lib/uploads.js";
import { requestIdMiddleware } from "../shared/middleware/request-id.js";
import { notFoundHandler, errorHandler } from "../middleware/error.middleware.js";
import "../modules/notifications/notification.subscriptions.js";
import "../modules/audit-logs/audit-log.subscriptions.js";

const app = express();

app.use(requestIdMiddleware);

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (env.NODE_ENV !== "test" && req.log) {
    req.log.info({ method: req.method, url: req.url }, `HTTP ${req.method} ${req.url}`);
  }
  next();
});

app.use("/", healthRouter);

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(UPLOADS_DIR, { dotfiles: "deny", maxAge: "1d", index: false })
);

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
