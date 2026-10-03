import { Router } from "express";
import restaurantController from "./restaurant.controller.js";
import { updateRestaurantSchema, updateRestaurantStatusSchema } from "./restaurant.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import { authRateLimiter } from "../../shared/middleware/rate-limiters.js";

const router = Router();

// Public: brands a restaurant's staff login page (name + logo for the slug in the host).
router.get("/public/:slug", authRateLimiter, (req, res, next) => {
  restaurantController.getPublicProfile(req, res, next);
});

router.use(authenticate, requireTenantContext);

router.get(
  "/",
  authorize("restaurants.view", "restaurants.manage", "orders.view", "menu.view", "dashboard.view"),
  (req, res, next) => {
    restaurantController.getProfile(req, res, next);
  }
);

router.patch(
  "/",
  authorize("restaurants.manage"),
  validate(updateRestaurantSchema),
  (req, res, next) => {
    restaurantController.updateProfile(req, res, next);
  }
);

router.patch(
  "/status",
  authorize("restaurants.manage"),
  validate(updateRestaurantStatusSchema),
  (req, res, next) => {
    restaurantController.updateStatus(req, res, next);
  }
);

export default router;
