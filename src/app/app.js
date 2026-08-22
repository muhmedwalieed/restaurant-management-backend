import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import env from "../config/env.js";
import routes from "../routes/index.js";
import healthRouter from "../routes/health.routes.js";
import { requestIdMiddleware } from "../shared/middleware/request-id.js";
import { notFoundHandler, errorHandler } from "../middleware/error.middleware.js";
import "../modules/notifications/notification.subscriptions.js";
import "../modules/audit-logs/audit-log.subscriptions.js";

const app = express();

// Request correlation ID middleware
app.use(requestIdMiddleware);

// Security headers & CORS
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Body parsing
app.use(
  express.json({
    limit: "10kb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// HTTP Request logging with Pino (disabled in test mode to keep test logs clean)
app.use((req, res, next) => {
  if (env.NODE_ENV !== "test" && req.log) {
    req.log.info({ method: req.method, url: req.url }, `HTTP ${req.method} ${req.url}`);
  }
  next();
});

// Root level health endpoints (/health, /ready) mounted ONLY at root /
app.use("/", healthRouter);

// API Routes mounted under /api
app.use("/api", routes);

// 404 and Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;