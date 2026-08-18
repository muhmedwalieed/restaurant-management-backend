import { Router } from "express";
import rateLimit from "express-rate-limit";
import authController from "./auth.controller.js";
import { registerSchema, loginSchema, refreshTokenSchema, forceLogoutSchema } from "./auth.validation.js";
import { authenticate } from "./authenticate.middleware.js";
import { authorize } from "./authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import env from "../../config/env.js";

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 1000 : 10, // 10 attempts per 15 minutes in production
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts, please try again after 15 minutes",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endpoints
router.post("/register", authRateLimiter, validate(registerSchema), (req, res, next) => {
  authController.register(req, res, next);
});

router.post("/login", authRateLimiter, validate(loginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

router.post("/refresh", authRateLimiter, validate(refreshTokenSchema), (req, res, next) => {
  authController.refresh(req, res, next);
});

// Authenticated endpoints
router.post("/logout", authenticate, requireTenantContext, (req, res, next) => {
  authController.logout(req, res, next);
});

router.post(
  "/force-logout",
  authenticate,
  requireTenantContext,
  authorize("employees.manage_roles"),
  validate(forceLogoutSchema),
  (req, res, next) => {
    authController.forceLogout(req, res, next);
  }
);

export default router;
