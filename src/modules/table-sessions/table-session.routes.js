import { Router } from "express";
import tableSessionController from "./table-session.controller.js";
import { requireMember } from "./require-member.middleware.js";
import {
  joinSessionSchema,
  addSessionItemSchema,
  updateSessionItemSchema,
  callWaiterSchema,
} from "./table-session.validation.js";
import { tableCustomerRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.post("/sessions/:qrToken/join", tableCustomerRateLimiter, validate(joinSessionSchema), (req, res, next) =>
  tableSessionController.joinSession(req, res, next)
);
router.get("/sessions/:id", requireMember, tableCustomerRateLimiter, (req, res, next) =>
  tableSessionController.getSession(req, res, next)
);
router.post("/sessions/:id/items", requireMember, tableCustomerRateLimiter, validate(addSessionItemSchema), (req, res, next) =>
  tableSessionController.addItem(req, res, next)
);
router.patch("/sessions/:id/items/:itemId", requireMember, tableCustomerRateLimiter, validate(updateSessionItemSchema), (req, res, next) =>
  tableSessionController.updateItem(req, res, next)
);
router.delete("/sessions/:id/items/:itemId", requireMember, tableCustomerRateLimiter, (req, res, next) =>
  tableSessionController.removeItem(req, res, next)
);
router.post("/sessions/:id/call-waiter", requireMember, tableCustomerRateLimiter, validate(callWaiterSchema), (req, res, next) =>
  tableSessionController.callWaiter(req, res, next)
);
router.post("/sessions/:id/submit", requireMember, tableCustomerRateLimiter, (req, res, next) =>
  tableSessionController.submitDraft(req, res, next)
);

const staffRouter = Router({ mergeParams: true });
staffRouter.use(authenticate, requireTenantContext);

staffRouter.post("/start", authorize("orders.create"), (req, res, next) =>
  tableSessionController.startSession(req, res, next)
);
staffRouter.get("/sessions", authorize("orders.view"), (req, res, next) => tableSessionController.listBranchSessions(req, res, next));
staffRouter.get("/table/:tableId/session", authorize("orders.view"), (req, res, next) => tableSessionController.getActiveSessionForTable(req, res, next));
staffRouter.post("/:id/confirm", authorize("orders.create"), (req, res, next) =>
  tableSessionController.confirmSession(req, res, next)
);
staffRouter.post("/:id/close", authorize("orders.create"), (req, res, next) =>
  tableSessionController.closeSession(req, res, next)
);
staffRouter.post("/:id/regenerate-pin", authorize("orders.create"), (req, res, next) =>
  tableSessionController.regeneratePin(req, res, next)
);
staffRouter.post("/:id/reject-order", authorize("orders.create"), (req, res, next) =>
  tableSessionController.rejectPendingOrder(req, res, next)
);
staffRouter.post("/:id/waiter-call/accept", authorize("orders.create"), (req, res, next) =>
  tableSessionController.acceptWaiterCall(req, res, next)
);
staffRouter.post("/:id/waiter-call/dismiss", authorize("orders.create"), (req, res, next) =>
  tableSessionController.dismissWaiterCall(req, res, next)
);
staffRouter.patch("/:id/items/:itemId", authorize("orders.create"), (req, res, next) =>
  tableSessionController.updateItemStaff(req, res, next)
);
staffRouter.delete("/:id/items/:itemId", authorize("orders.create"), (req, res, next) =>
  tableSessionController.removeItemStaff(req, res, next)
);
staffRouter.get("/:id", authorize("orders.view"), (req, res, next) => tableSessionController.getSessionStaff(req, res, next));

router.use("/tables", staffRouter);

export default router;
