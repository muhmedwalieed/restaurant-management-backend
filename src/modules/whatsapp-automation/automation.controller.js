import whatsAppAutomationService from "./automation.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class AutomationController {
  async listConversations(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const { items, pagination } = await whatsAppAutomationService.listConversations(
        req.tenantContext,
        query
      );

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getConversationById(req, res, next) {
    try {
      const conv = await whatsAppAutomationService.getConversationById(
        req.tenantContext,
        req.params.id
      );

      return sendSuccess(res, {
        data: conv,
      });
    } catch (error) {
      next(error);
    }
  }

  async handoffConversation(req, res, next) {
    try {
      const conv = await whatsAppAutomationService.handoffConversation(
        req.tenantContext,
        req.params.id
      );

      return sendSuccess(res, {
        message: "Conversation transferred to live support agent (status: WAITING_AGENT)",
        data: conv,
      });
    } catch (error) {
      next(error);
    }
  }

  async closeConversation(req, res, next) {
    try {
      const conv = await whatsAppAutomationService.closeConversation(
        req.tenantContext,
        req.params.id
      );

      return sendSuccess(res, {
        message: "Conversation closed successfully (status: CLOSED)",
        data: conv,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const automationController = new AutomationController();
export default automationController;
