import { Router } from "express";
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
import { publicMenuRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize, authorizeAny } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.get("/public", publicMenuRateLimiter, validate(publicMenuQuerySchema), (req, res, next) => {
  menuController.getPublicMenu(req, res, next);
});

router.use(authenticate, requireTenantContext);

router.get("/categories", authorizeAny("menu.view", "menu.manage"), validate(categoryQuerySchema), (req, res, next) => {
  menuController.listCategories(req, res, next);
});

router.post("/categories", authorize("menu.manage"), validate(createCategorySchema), (req, res, next) => {
  menuController.createCategory(req, res, next);
});

router.get("/categories/:id", authorizeAny("menu.view", "menu.manage"), (req, res, next) => {
  menuController.getCategoryById(req, res, next);
});

router.patch("/categories/:id", authorize("menu.manage"), validate(updateCategorySchema), (req, res, next) => {
  menuController.updateCategory(req, res, next);
});

router.delete("/categories/:id", authorize("menu.manage"), (req, res, next) => {
  menuController.deleteCategory(req, res, next);
});

router.get("/products", authorizeAny("menu.view", "menu.manage"), validate(productQuerySchema), (req, res, next) => {
  menuController.listProducts(req, res, next);
});

router.post("/products", authorize("menu.manage"), validate(createProductSchema), (req, res, next) => {
  menuController.createProduct(req, res, next);
});

router.get("/products/:id", authorizeAny("menu.view", "menu.manage"), (req, res, next) => {
  menuController.getProductById(req, res, next);
});

router.patch("/products/:id", authorize("menu.manage"), validate(updateProductSchema), (req, res, next) => {
  menuController.updateProduct(req, res, next);
});

router.delete("/products/:id", authorize("menu.manage"), (req, res, next) => {
  menuController.deleteProduct(req, res, next);
});

router.get("/products/:id/modifiers", authorizeAny("menu.view", "menu.manage"), (req, res, next) => {
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
