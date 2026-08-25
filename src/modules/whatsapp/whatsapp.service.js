import whatsAppRepository from "./whatsapp.repository.js";
import getWhatsAppProvider from "./providers/provider_factory.js";
import {
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ExternalServiceError,
} from "../../shared/errors/index.js";

export class WhatsAppService {

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

    return whatsAppRepository.createConnectionTransaction(tenantContext, payload);
  }

  async getConnection(tenantContext) {
    const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
    if (!connection) {
      throw new NotFoundError("No active WhatsApp connection found for this restaurant");
    }
    return connection;
  }

  async updateConnection(tenantContext, payload) {
    const connection = await this.getConnection(tenantContext);

    await whatsAppRepository.updateConnectionTransaction(tenantContext, connection.id, payload);
    return whatsAppRepository.findConnectionById(tenantContext, connection.id);
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

    try {
      const result = await provider.sendMessage({
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

      if (error instanceof ExternalServiceError) {
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

    const totalPages = Math.ceil(result.total / limit) || 1;

    return {
      items: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    };
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

      if (change?.messages?.[0]) {
        const msg = change.messages[0];
        const fromPhone = msg.from;
        const content = msg.text?.body || msg.body || null;
        const providerMessageId = msg.id;

        const existingMsg = await whatsAppRepository.findMessageByProviderId(
          tenantContext,
          providerMessageId
        );

        if (!existingMsg) {
          await whatsAppRepository.createMessage(tenantContext, {
            connectionId: connection.id,
            direction: "INBOUND",
            type: "TEXT",
            fromPhone,
            toPhone: connection.providerPhoneNumberId,
            content,
            providerMessageId,
            status: "DELIVERED",
          });

          try {
            const { whatsAppAutomationService } = await import("../whatsapp-automation/automation.service.js");
            await whatsAppAutomationService.handleInboundMessage(tenantContext, connection, {
              fromPhone,
              content,
              providerMessageId,
            });
          } catch (autoErr) {

          }
        }
      }

      if (change?.statuses?.[0]) {
        const st = change.statuses[0];
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

  handleVerification(queryParams) {
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!expectedToken) {
      throw new ExternalServiceError("WHATSAPP_VERIFY_TOKEN is not configured in the environment");
    }

    const provider = getWhatsAppProvider("META");
    return provider.handleVerification(queryParams, expectedToken);
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
