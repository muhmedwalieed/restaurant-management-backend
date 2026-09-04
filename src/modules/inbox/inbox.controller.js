import inboxService from "./inbox.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class InboxController {
  listConversations = asyncHandler(async (req, res) => {
    const { items, pagination } = await inboxService.listConversations(req.tenantContext, req.query);
    return sendSuccess(res, { data: items, pagination });
  });

  getConversation = asyncHandler(async (req, res) => {
    const conv = await inboxService.getConversation(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: conv });
  });

  createTicket = asyncHandler(async (req, res) => {
    const ticket = await inboxService.createTicket(req.tenantContext, req.body);
    return sendSuccess(res, { message: "Ticket created successfully", data: ticket, statusCode: 201 });
  });

  assignConversation = asyncHandler(async (req, res) => {
    const conv = await inboxService.assignConversation(req.tenantContext, req.params.id, req.body.agentId);
    return sendSuccess(res, { message: "Conversation assigned successfully", data: conv });
  });

  reply = asyncHandler(async (req, res) => {
    const conv = await inboxService.reply(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, { message: "Reply sent successfully", data: conv });
  });

  addNote = asyncHandler(async (req, res) => {
    const conv = await inboxService.addNote(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, { message: "Internal note added", data: conv });
  });

  resolveConversation = asyncHandler(async (req, res) => {
    const conv = await inboxService.resolveConversation(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: "Conversation resolved", data: conv });
  });

  closeConversation = asyncHandler(async (req, res) => {
    const conv = await inboxService.closeConversation(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, { message: "Conversation closed with resolution", data: conv });
  });

  submitFeedback = asyncHandler(async (req, res) => {
    const conv = await inboxService.submitCustomerFeedback(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, { message: "Feedback submitted successfully", data: conv });
  });

  takeover = asyncHandler(async (req, res) => {
    const conv = await inboxService.takeover(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: "Conversation taken over (locked on manager)", data: conv });
  });

  returnToAgent = asyncHandler(async (req, res) => {
    const conv = await inboxService.returnToAgent(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: "Conversation returned to agent", data: conv });
  });

  reassign = asyncHandler(async (req, res) => {
    const conv = await inboxService.reassign(req.tenantContext, req.params.id, req.body.agentId);
    return sendSuccess(res, { message: "Conversation reassigned", data: conv });
  });
}

export const inboxController = new InboxController();
export default inboxController;
