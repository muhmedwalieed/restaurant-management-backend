import whatsAppService from "./whatsapp.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class WhatsAppController {
  connectAccount = asyncHandler(async (req, res) => {
    const connection = await whatsAppService.connectAccount(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "WhatsApp account connected successfully",
      data: connection,
    });
  });

  getConnection = asyncHandler(async (req, res) => {
    const connection = await whatsAppService.getConnection(req.tenantContext);
    return sendSuccess(res, { data: connection });
  });

  updateConnection = asyncHandler(async (req, res) => {
    const connection = await whatsAppService.updateConnection(req.tenantContext, req.body);
    return sendSuccess(res, {
      message: "WhatsApp connection updated successfully",
      data: connection,
    });
  });

  disconnectAccount = asyncHandler(async (req, res) => {
    const result = await whatsAppService.disconnectAccount(req.tenantContext);
    return sendSuccess(res, { message: result.message });
  });

  sendMessage = asyncHandler(async (req, res) => {
    const message = await whatsAppService.sendMessage(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "WhatsApp message sent successfully",
      data: message,
    });
  });

  listMessages = asyncHandler(async (req, res) => {
    const { items, pagination } = await whatsAppService.listMessages(req.tenantContext, req.query);
    return sendSuccess(res, { data: items, pagination });
  });

  getMessageById = asyncHandler(async (req, res) => {
    const message = await whatsAppService.getMessageById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: message });
  });

  handleWebhook = asyncHandler(async (req, res) => {
    const result = await whatsAppService.handleInboundWebhook(
      req.tenantContext,
      req.whatsappConnection,
      req.body || {}
    );
    return res.status(200).json({ success: true, ...result });
  });

  handleVerification = asyncHandler(async (req, res) => {
    const challenge = await whatsAppService.handleVerification(req.query);
    return res.status(200).send(challenge);
  });

  retryFailedWebhooks = asyncHandler(async (req, res) => {
    const result = await whatsAppService.retryFailedWebhookEvents(req.tenantContext);
    return sendSuccess(res, {
      message: `Retried ${result.retriedCount} of ${result.totalFailed} failed webhook events`,
      data: result,
    });
  });
}

export const whatsAppController = new WhatsAppController();
export default whatsAppController;
