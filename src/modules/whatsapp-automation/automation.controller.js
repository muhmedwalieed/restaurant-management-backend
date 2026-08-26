import whatsAppAutomationService from "./automation.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class AutomationController {
  listConversations = asyncHandler(async (req, res) => {
    const { items, pagination } = await whatsAppAutomationService.listConversations(
      req.tenantContext,
      req.query
    );
    return sendSuccess(res, { data: items, pagination });
  });

  getConversationById = asyncHandler(async (req, res) => {
    const conv = await whatsAppAutomationService.getConversationById(
      req.tenantContext,
      req.params.id
    );
    return sendSuccess(res, { data: conv });
  });

  handoffConversation = asyncHandler(async (req, res) => {
    const conv = await whatsAppAutomationService.handoffConversation(
      req.tenantContext,
      req.params.id
    );
    return sendSuccess(res, {
      message: "Conversation transferred to live support agent (status: WAITING_AGENT)",
      data: conv,
    });
  });

  closeConversation = asyncHandler(async (req, res) => {
    const conv = await whatsAppAutomationService.closeConversation(
      req.tenantContext,
      req.params.id
    );
    return sendSuccess(res, {
      message: "Conversation closed successfully (status: CLOSED)",
      data: conv,
    });
  });
}

export const automationController = new AutomationController();
export default automationController;
