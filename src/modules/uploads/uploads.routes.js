import { Router } from "express";
import rateLimit from "express-rate-limit";
import uploadsController from "./uploads.controller.js";
import { uploadImageMiddleware } from "../../lib/uploads.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";

const router = Router();
router.use(authenticate, requireTenantContext);

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many uploads, please try again later" },
  },
});

router.post("/", uploadLimiter, uploadImageMiddleware.single("image"), (req, res, next) => {
  uploadsController.uploadImage(req, res, next);
});

export default router;
