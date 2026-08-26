import { Router } from "express";
import authController from "./auth.controller.js";
import { registerSchema, loginSchema, refreshTokenSchema, forceLogoutSchema } from "./auth.validation.js";
import { authRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "./authenticate.middleware.js";
import { authorize } from "./authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.post("/register", authRateLimiter, validate(registerSchema), (req, res, next) => {
  authController.register(req, res, next);
});

router.post("/login", authRateLimiter, validate(loginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

router.post("/refresh", authRateLimiter, validate(refreshTokenSchema), (req, res, next) => {
  authController.refresh(req, res, next);
});

router.post("/logout", authenticate, requireTenantContext, (req, res, next) => {
  authController.logout(req, res, next);
});

router.get("/me", authenticate, requireTenantContext, (req, res, next) => {
  authController.me(req, res, next);
});

router.post(
  "/force-logout",
  authenticate,
  requireTenantContext,
  authorize("employees.manage"),
  validate(forceLogoutSchema),
  (req, res, next) => {
    authController.forceLogout(req, res, next);
  }
);

export default router;
