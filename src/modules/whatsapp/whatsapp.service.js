import whatsAppRepository from "./whatsapp.repository.js";
import getWhatsAppProvider from "./providers/provider_factory.js";
import { decrypt } from "../../shared/utils/crypto.js";
import logger from "../../config/logger.js";
import {
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ExternalServiceError,
  AuthorizationError,
} from "../../shared/errors/index.js";
import { paginateResponse } from "../../shared/utils/pagination.js";

export class WhatsAppService {

  sanitizeConnection(connection) {
    if (!connection) return connection;
    const { apiToken, webhookSecret, verifyToken, ...safe } = connection;
    return {
      ...safe,
      hasApiToken: Boolean(apiToken),
      hasWebhookSecret: Boolean(webhookSecret),
      hasVerifyToken: Boolean(verifyToken),
    };
  }

  async connectAccount(tenantContext, payload) {
    const existing = await whatsAppRepository.findConnectionByAccountId(
      tenantContext,
      payload.providerAccountId
    );

    if (existing) {
      throw new ConflictError("WhatsApp account already registered under this tenant");
    }

    const activeWithPhone = await whatsAppRepository.findConnectionByPhoneNumberId(
      payload.providerPhoneNumberId
    );
    if (activeWithPhone && activeWithPhone.restaurantId !== tenantContext.restaurantId) {
      throw new ConflictError("WhatsApp phone number is already connected to another restaurant");
    }

    return this.sanitizeConnection(
      await whatsAppRepository.createConnectionTransaction(tenantContext, payload)
    );
  }

  async getConnection(tenantContext) {
    const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
    if (!connection) {
      throw new NotFoundError("No active WhatsApp connection found for this restaurant");
    }
    return this.sanitizeConnection(connection);
  }

  async updateConnection(tenantContext, payload) {
    const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
    if (!connection) {
      throw new NotFoundError("No active WhatsApp connection found for this restaurant");
    }

    await whatsAppRepository.updateConnectionTransaction(tenantContext, connection.id, payload);
    return this.sanitizeConnection(
      await whatsAppRepository.findConnectionById(tenantContext, connection.id)
    );
  }

  async disconnectAccount(tenantContext) {
    const connection = await this.getConnection(tenantContext);

    await whatsAppRepository.softDeactivateConnection(tenantContext, connection.id);
    return { message: "WhatsApp connection disconnected successfully" };
  }

  async sendMessage(tenantContext, payload) {
    const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
    if (!connection || connection.status !== "ACTIVE") {
      throw new BusinessRuleError("No active WhatsApp connection. Please connect a WhatsApp account first");
    }

    const provider = getWhatsAppProvider(connection.provider);
    const decryptedApiToken = connection.apiToken ? decrypt(connection.apiToken) : null;

    try {
      const result = await provider.sendMessage({
        phoneNumberId: connection.providerPhoneNumberId,
        apiToken: decryptedApiToken,
        to: payload.to,
        text: payload.text,
        type: payload.type || "TEXT",
      });

      const message = await whatsAppRepository.createMessage(tenantContext, {
        connectionId: connection.id,
        direction: "OUTBOUND",
        type: payload.type || "TEXT",
        fromPhone: connection.providerPhoneNumberId,
        toPhone: payload.to,
        content: payload.text,
        providerMessageId: result.providerMessageId,
        status: "SENT",
      });

      return message;
    } catch (error) {
      await whatsAppRepository.createMessage(tenantContext, {
        connectionId: connection.id,
        direction: "OUTBOUND",
        type: payload.type || "TEXT",
        fromPhone: connection.providerPhoneNumberId,
        toPhone: payload.to,
        content: payload.text,
        status: "FAILED",
      });

      if (error instanceof ExternalServiceError || error instanceof BusinessRuleError) {
        throw error;
      }
      throw new ExternalServiceError(error.message || "Failed to send WhatsApp message via provider");
    }
  }

  async listMessages(tenantContext, query = {}) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

    const result = await whatsAppRepository.findMessagesByTenant(tenantContext, {
      page,
      limit,
      direction: query.direction,
      status: query.status,
      q: query.q,
    });

    return paginateResponse(result.items, result.total, page, limit);
  }

  async getMessageById(tenantContext, id) {
    const message = await whatsAppRepository.findMessageById(tenantContext, id);
    if (!message) {
      throw new NotFoundError("Message not found or access denied");
    }
    return message;
  }

  async handleInboundWebhook(tenantContext, connection, payload) {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const eventId = payload?.eventId || change?.messages?.[0]?.id || change?.statuses?.[0]?.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const existingEvent = await whatsAppRepository.findEventByEventId(tenantContext, eventId);
    if (existingEvent && existingEvent.status === "PROCESSED") {
      return { isDuplicate: true, message: "Event already processed (Replay protection)" };
    }

    if (!existingEvent) {
      await whatsAppRepository.createEvent(tenantContext, {
        eventId,
        provider: connection.provider || "META",
        rawPayload: payload,
        status: "RECEIVED",
      });
    }

    try {

      const messagesList = Array.isArray(change?.messages)
        ? change.messages
        : change?.messages
        ? [change.messages]
        : [];

      for (const msg of messagesList) {
        const fromPhone = msg.from;
        const content =
          msg.text?.body ||
          msg.button?.text ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.title ||
          msg.interactive?.list_reply?.id ||
          msg.body ||
          null;
        const providerMessageId = msg.id;

        const existingMsg = await whatsAppRepository.findMessageByProviderId(
          tenantContext,
          providerMessageId
        );

        if (!existingMsg) {
          await whatsAppRepository.createMessage(tenantContext, {
            connectionId: connection.id,
            direction: "INBOUND",
            type: msg.type?.toUpperCase() || "TEXT",
            fromPhone,
            toPhone: connection.providerPhoneNumberId,
            content,
            providerMessageId,
            status: "DELIVERED",
          });

          try {
            const { automationService, whatsAppAutomationService } = await import("../whatsapp-automation/automation.service.js");
            const service = automationService || whatsAppAutomationService;
            if (service) {
              await service.handleInboundMessage(tenantContext, connection, {
                fromPhone,
                content,
                providerMessageId,
              });
            }
          } catch (autoErr) {
            logger.error({ err: autoErr.message }, "WhatsApp automation inbound message error");
          }
        }
      }

      const statusesList = Array.isArray(change?.statuses)
        ? change.statuses
        : change?.statuses
        ? [change.statuses]
        : [];

      for (const st of statusesList) {
        const providerMessageId = st.id;
        const statusMap = {
          sent: "SENT",
          delivered: "DELIVERED",
          read: "READ",
          failed: "FAILED",
        };
        const targetStatus = statusMap[st.status?.toLowerCase()] || "SENT";

        const existingMsg = await whatsAppRepository.findMessageByProviderId(tenantContext, providerMessageId);
        if (existingMsg) {
          await whatsAppRepository.updateMessageStatus(tenantContext, existingMsg.id, targetStatus);
        }
      }

      await whatsAppRepository.markEventProcessed(tenantContext, eventId);
      return { success: true };
    } catch (error) {
      await whatsAppRepository.markEventFailed(tenantContext, eventId, error.message);
      return { success: false, error: error.message };
    }
  }

  async handleVerification(queryParams) {
    const token = queryParams["hub.verify_token"] || queryParams.verify_token || queryParams.token;

    if (!token) {
      throw new AuthorizationError("Verification token missing");
    }

    // 1. Check if token matches a tenant's connection in DB
    const connection = await whatsAppRepository.findConnectionByVerifyToken(token);
    if (connection) {
      const provider = getWhatsAppProvider(connection.provider);
      return provider.handleVerification(queryParams, connection.verifyToken);
    }

    // 2. Check fallback global verify token if configured
    const fallbackToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (fallbackToken && token === fallbackToken) {
      const provider = getWhatsAppProvider("META");
      return provider.handleVerification(queryParams, fallbackToken);
    }

    throw new AuthorizationError("Verification token mismatch");
  }

  async retryFailedWebhookEvents(tenantContext) {
    const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
    if (!connection) {
      throw new NotFoundError("No active connection for webhook retry");
    }

    const failedEvents = await whatsAppRepository.findFailedEvents(tenantContext);
    let retriedCount = 0;

    for (const event of failedEvents) {
      const payloadWithEventId = {
        ...(typeof event.rawPayload === "object" ? event.rawPayload : {}),
        eventId: event.eventId,
      };
      const res = await this.handleInboundWebhook(tenantContext, connection, payloadWithEventId);
      if (res.success) {
        retriedCount++;
      }
    }

    return { retriedCount, totalFailed: failedEvents.length };
  }
}

export const whatsAppService = new WhatsAppService();
export default whatsAppService;
