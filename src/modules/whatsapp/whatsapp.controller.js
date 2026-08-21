import whatsAppService from "./whatsapp.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class WhatsAppController {
  async connectAccount(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const connection = await whatsAppService.connectAccount(req.tenantContext, body);

      return sendSuccess(res, {
        statusCode: 201,
        message: "WhatsApp account connected successfully",
        data: connection,
      });
    } catch (error) {
      next(error);
    }
  }

  async getConnection(req, res, next) {
    try {
      const connection = await whatsAppService.getConnection(req.tenantContext);
      return sendSuccess(res, {
        data: connection,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateConnection(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const connection = await whatsAppService.updateConnection(req.tenantContext, body);

      return sendSuccess(res, {
        message: "WhatsApp connection updated successfully",
        data: connection,
      });
    } catch (error) {
      next(error);
    }
  }

  async disconnectAccount(req, res, next) {
    try {
      const result = await whatsAppService.disconnectAccount(req.tenantContext);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const message = await whatsAppService.sendMessage(req.tenantContext, body);

      return sendSuccess(res, {
        statusCode: 201,
        message: "WhatsApp message sent successfully",
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  async listMessages(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const { items, pagination } = await whatsAppService.listMessages(req.tenantContext, query);

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMessageById(req, res, next) {
    try {
      const message = await whatsAppService.getMessageById(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  async handleWebhook(req, res, next) {
    try {
      const body = req.body || {};
      const result = await whatsAppService.handleInboundWebhook(
        req.tenantContext,
        req.whatsappConnection,
        body
      );

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async handleVerification(req, res, next) {
    try {
      const challenge = whatsAppService.handleVerification(req.query);
      return res.status(200).send(challenge);
    } catch (error) {
      next(error);
    }
  }

  async retryFailedWebhooks(req, res, next) {
    try {
      const result = await whatsAppService.retryFailedWebhookEvents(req.tenantContext);
      return sendSuccess(res, {
        message: `Retried ${result.retriedCount} of ${result.totalFailed} failed webhook events`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const whatsAppController = new WhatsAppController();
export default whatsAppController;
