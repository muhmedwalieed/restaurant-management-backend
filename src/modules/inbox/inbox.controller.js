import inboxService from "./inbox.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class InboxController {
  async listConversations(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const { items, pagination } = await inboxService.listConversations(req.tenantContext, query);
      return sendSuccess(res, { data: items, pagination });
    } catch (error) {
      next(error);
    }
  }

  async getConversation(req, res, next) {
    try {
      const conv = await inboxService.getConversation(req.tenantContext, req.params.id);
      return sendSuccess(res, { data: conv });
    } catch (error) {
      next(error);
    }
  }

  async assignConversation(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const conv = await inboxService.assignConversation(req.tenantContext, req.params.id, body.agentId);
      return sendSuccess(res, { message: "Conversation assigned successfully", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async reply(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const conv = await inboxService.reply(req.tenantContext, req.params.id, body);
      return sendSuccess(res, { message: "Reply sent successfully", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async addNote(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const conv = await inboxService.addNote(req.tenantContext, req.params.id, body);
      return sendSuccess(res, { message: "Internal note added", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async resolveConversation(req, res, next) {
    try {
      const conv = await inboxService.resolveConversation(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: "Conversation resolved", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async closeConversation(req, res, next) {
    try {
      const conv = await inboxService.closeConversation(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: "Conversation closed", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async takeover(req, res, next) {
    try {
      const conv = await inboxService.takeover(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: "Conversation taken over (locked on manager)", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async returnToAgent(req, res, next) {
    try {
      const conv = await inboxService.returnToAgent(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: "Conversation returned to agent", data: conv });
    } catch (error) {
      next(error);
    }
  }

  async reassign(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const conv = await inboxService.reassign(req.tenantContext, req.params.id, body.agentId);
      return sendSuccess(res, { message: "Conversation reassigned", data: conv });
    } catch (error) {
      next(error);
    }
  }
}

export const inboxController = new InboxController();
export default inboxController;