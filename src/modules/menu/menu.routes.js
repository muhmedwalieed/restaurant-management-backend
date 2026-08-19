import { Router } from "express";
import rateLimit from "express-rate-limit";
import menuController from "./menu.controller.js";
import {
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  productQuerySchema,
  createProductSchema,
  updateProductSchema,
  createModifierSchema,
  updateModifierSchema,
  publicMenuQuerySchema,
} from "./menu.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import env from "../../config/env.js";

const router = Router();

// Public unauthenticated endpoint rate limiter (Section 19: rate limit public endpoints)
const publicMenuRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 1000 : 60, // 60 requests per 15 minutes in production
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again after 15 minutes",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== PUBLIC MENU ENDPOINT (No auth required) ====================
router.get("/public", publicMenuRateLimiter, validate(publicMenuQuerySchema), (req, res, next) => {
  menuController.getPublicMenu(req, res, next);
});

// ==================== AUTHENTICATED TENANT PIPELINE ====================
// Pipeline: authenticate -> requireTenantContext -> authorize("menu.manage") -> validate(schema)
router.use(authenticate, requireTenantContext);

// ------------ CATEGORIES ------------
router.get("/categories", authorize("menu.manage"), validate(categoryQuerySchema), (req, res, next) => {
  menuController.listCategories(req, res, next);
});

router.post("/categories", authorize("menu.manage"), validate(createCategorySchema), (req, res, next) => {
  menuController.createCategory(req, res, next);
});

router.get("/categories/:id", authorize("menu.manage"), (req, res, next) => {
  menuController.getCategoryById(req, res, next);
});

router.patch("/categories/:id", authorize("menu.manage"), validate(updateCategorySchema), (req, res, next) => {
  menuController.updateCategory(req, res, next);
});

router.delete("/categories/:id", authorize("menu.manage"), (req, res, next) => {
  menuController.deleteCategory(req, res, next);
});

// ------------ PRODUCTS ------------
router.get("/products", authorize("menu.manage"), validate(productQuerySchema), (req, res, next) => {
  menuController.listProducts(req, res, next);
});

router.post("/products", authorize("menu.manage"), validate(createProductSchema), (req, res, next) => {
  menuController.createProduct(req, res, next);
});

router.get("/products/:id", authorize("menu.manage"), (req, res, next) => {
  menuController.getProductById(req, res, next);
});

router.patch("/products/:id", authorize("menu.manage"), validate(updateProductSchema), (req, res, next) => {
  menuController.updateProduct(req, res, next);
});

router.delete("/products/:id", authorize("menu.manage"), (req, res, next) => {
  menuController.deleteProduct(req, res, next);
});

// ------------ PRODUCT MODIFIERS (ADD-ONS) ------------
router.get("/products/:id/modifiers", authorize("menu.manage"), (req, res, next) => {
  menuController.listModifiers(req, res, next);
});

router.post(
  "/products/:id/modifiers",
  authorize("menu.manage"),
  validate(createModifierSchema),
  (req, res, next) => {
    menuController.createModifier(req, res, next);
  }
);

router.patch(
  "/products/:productId/modifiers/:modifierId",
  authorize("menu.manage"),
  validate(updateModifierSchema),
  (req, res, next) => {
    menuController.updateModifier(req, res, next);
  }
);

router.delete("/products/:productId/modifiers/:modifierId", authorize("menu.manage"), (req, res, next) => {
  menuController.deleteModifier(req, res, next);
});

export default router;
