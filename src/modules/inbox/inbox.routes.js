import { Router } from "express";
import inboxController from "./inbox.controller.js";
import {
  inboxQuerySchema,
  createTicketSchema,
  assignConversationSchema,
  replySchema,
  noteSchema,
  closeTicketSchema,
  submitFeedbackSchema,
  reassignConversationSchema,
} from "./inbox.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize, authorizeAny } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/conversations", authorize("chats.view"), validate(inboxQuerySchema), (req, res, next) => {
  inboxController.listConversations(req, res, next);
});

router.post("/conversations", authorize("chats.view"), validate(createTicketSchema), (req, res, next) => {
  inboxController.createTicket(req, res, next);
});

router.get("/conversations/:id", authorize("chats.view"), (req, res, next) => {
  inboxController.getConversation(req, res, next);
});

router.post("/conversations/:id/assign", authorize("chats.assign"), validate(assignConversationSchema), (req, res, next) => {
  inboxController.assignConversation(req, res, next);
});

router.post("/conversations/:id/reply", authorize("chats.reply"), validate(replySchema), (req, res, next) => {
  inboxController.reply(req, res, next);
});

router.post("/conversations/:id/note", authorize("chats.reply"), validate(noteSchema), (req, res, next) => {
  inboxController.addNote(req, res, next);
});

router.post("/conversations/:id/resolve", authorize("chats.close"), (req, res, next) => {
  inboxController.resolveConversation(req, res, next);
});

router.post("/conversations/:id/close", authorizeAny("chats.close", "whatsapp.manage"), validate(closeTicketSchema), (req, res, next) => {
  inboxController.closeConversation(req, res, next);
});

router.post("/conversations/:id/feedback", authorizeAny("chats.view", "chats.reply"), validate(submitFeedbackSchema), (req, res, next) => {
  inboxController.submitFeedback(req, res, next);
});

router.post("/conversations/:id/takeover", authorize("chats.takeover"), (req, res, next) => {
  inboxController.takeover(req, res, next);
});

router.post("/conversations/:id/return", authorize("chats.takeover"), (req, res, next) => {
  inboxController.returnToAgent(req, res, next);
});

router.post("/conversations/:id/reassign", authorize("chats.takeover"), validate(reassignConversationSchema), (req, res, next) => {
  inboxController.reassign(req, res, next);
});

export default router;
