import { Router } from "express";
import rateLimit from "express-rate-limit";
import tableSessionController from "./table-session.controller.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import { z } from "zod";

// Public (customer) endpoints — reachable from the QR/menu page.
const joinSchema = z.object({
  body: z.object({ name: z.string().min(1).max(60), pin: z.string().length(4) }),
});
const addItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
    addedByName: z.string().max(60).optional(),
  }),
});
const updateItemSchema = z.object({
  body: z.object({ quantity: z.coerce.number().int().min(1) }),
});
const callWaiterSchema = z.object({
  body: z.object({
    requesterName: z.string().max(60).optional(),
    note: z.string().max(200).optional(),
    tableId: z.string().optional(),
  }),
});

const customerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" } },
});

const router = Router();

router.post("/sessions/:qrToken/join", customerLimiter, validate(joinSchema), (req, res, next) =>
  tableSessionController.joinSession(req, res, next)
);
router.get("/sessions/:id", customerLimiter, (req, res, next) => tableSessionController.getSession(req, res, next));
router.post("/sessions/:id/items", customerLimiter, validate(addItemSchema), (req, res, next) =>
  tableSessionController.addItem(req, res, next)
);
router.patch("/sessions/:id/items/:itemId", customerLimiter, validate(updateItemSchema), (req, res, next) =>
  tableSessionController.updateItem(req, res, next)
);
router.delete("/sessions/:id/items/:itemId", customerLimiter, (req, res, next) =>
  tableSessionController.removeItem(req, res, next)
);
router.post("/sessions/:id/call-waiter", customerLimiter, validate(callWaiterSchema), (req, res, next) =>
  tableSessionController.callWaiter(req, res, next)
);
router.post("/sessions/:id/submit", customerLimiter, (req, res, next) =>
  tableSessionController.submitDraft(req, res, next)
);

// Staff endpoints — start/confirm/close a session.
const staffRouter = Router({ mergeParams: true });
staffRouter.use(authenticate, requireTenantContext);

staffRouter.post("/start", authorize("orders.create"), (req, res, next) =>
  tableSessionController.startSession(req, res, next)
);
staffRouter.get("/sessions", (req, res, next) => tableSessionController.listBranchSessions(req, res, next));
staffRouter.get("/table/:tableId/session", (req, res, next) => tableSessionController.getActiveSessionForTable(req, res, next));
staffRouter.post("/:id/confirm", authorize("orders.create"), (req, res, next) =>
  tableSessionController.confirmSession(req, res, next)
);
staffRouter.post("/:id/close", authorize("orders.create"), (req, res, next) =>
  tableSessionController.closeSession(req, res, next)
);
staffRouter.get("/:id", (req, res, next) => tableSessionController.getSessionStaff(req, res, next));

router.use("/tables", staffRouter);

export default router;