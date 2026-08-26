import { Router } from "express";
import uploadsController from "./uploads.controller.js";
import { uploadImageMiddleware } from "../../lib/uploads.js";
import { uploadRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";

const router = Router();
router.use(authenticate, requireTenantContext);

router.post("/", uploadRateLimiter, uploadImageMiddleware.single("image"), (req, res, next) => {
  uploadsController.uploadImage(req, res, next);
});

export default router;
