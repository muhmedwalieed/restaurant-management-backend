import inboxRepository from "./inbox.repository.js";
import whatsAppService from "../whatsapp/whatsapp.service.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";

export class InboxService {
  async listConversations(tenantContext, query = {}) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

    const result = await inboxRepository.findConversations(tenantContext, {
      page,
      limit,
      status: query.status,
      assignedToMe: query.assignedToMe === "true",
    });

    const totalPages = Math.ceil(result.total / limit) || 1;
    return {
      items: result.items,
      pagination: { page, limit, total: result.total, totalPages },
    };
  }

  async getConversation(tenantContext, id) {
    const conv = await inboxRepository.findConversationById(tenantContext, id);
    if (!conv) {
      throw new NotFoundError("Conversation not found or access denied");
    }
    return conv;
  }

  async assignConversation(tenantContext, id, agentId) {
    const conv = await this.getConversation(tenantContext, id);
    const targetAgentId = agentId || tenantContext.employeeId;
    if (!targetAgentId) {
      throw new BusinessRuleError("No agent to assign the conversation to");
    }
    await inboxRepository.assignConversation(tenantContext, id, targetAgentId);
    return this.getConversation(tenantContext, id);
  }

  async reply(tenantContext, id, { content }) {
    const conv = await this.getConversation(tenantContext, id);

    // Send the reply to the customer over WhatsApp first (non-internal).
    await whatsAppService.sendMessage(tenantContext, {
      to: conv.customerPhone,
      text: content,
    });

    await inboxRepository.createMessage(tenantContext, {
      conversationId: id,
      senderType: "AGENT",
      content,
      isInternal: false,
      agentId: tenantContext.employeeId || null,
    });
    await inboxRepository.updateStatus(tenantContext, id, "ACTIVE");
    await inboxRepository.touchConversation(tenantContext, id);

    return this.getConversation(tenantContext, id);
  }

  async addNote(tenantContext, id, { content }) {
    const conv = await this.getConversation(tenantContext, id);

    // Internal note — never sent to the customer (Section 28).
    await inboxRepository.createMessage(tenantContext, {
      conversationId: id,
      senderType: "AGENT",
      content,
      isInternal: true,
      agentId: tenantContext.employeeId || null,
    });
    await inboxRepository.touchConversation(tenantContext, id);

    return this.getConversation(tenantContext, id);
  }

  async resolveConversation(tenantContext, id) {
    await this.getConversation(tenantContext, id);
    await inboxRepository.updateStatus(tenantContext, id, "RESOLVED");
    return this.getConversation(tenantContext, id);
  }

  async closeConversation(tenantContext, id) {
    await this.getConversation(tenantContext, id);
    await inboxRepository.updateStatus(tenantContext, id, "CLOSED");
    return this.getConversation(tenantContext, id);
  }

  // ==================== INTEGRATION HOOKS (called from Module 10 WhatsApp Automation) ====================

  /**
   * Creates an InboxConversation when a WhatsApp conversation is handed off (status WAITING_AGENT).
   */
  async createFromWhatsApp(tenantContext, whatsappConversation, customerPhone) {
    const existing = await inboxRepository.findConversationByWhatsAppId(
      tenantContext,
      whatsappConversation.id
    );
    if (existing) return existing;

    return inboxRepository.createConversation(tenantContext, {
      whatsappConversationId: whatsappConversation.id,
      customerId: whatsappConversation.customerId || null,
      customerPhone,
      status: "WAITING",
    });
  }

  /**
   * Records a customer inbound message into the inbox after handoff (Module 10 webhook).
   */
  async recordCustomerMessage(tenantContext, whatsappConversationId, customerPhone, content) {
    const conv = await inboxRepository.findConversationByWhatsAppId(
      tenantContext,
      whatsappConversationId
    );
    if (!conv) return null;

    await inboxRepository.createMessage(tenantContext, {
      conversationId: conv.id,
      senderType: "CUSTOMER",
      content: content || "",
      isInternal: false,
    });
    await inboxRepository.updateStatus(tenantContext, conv.id, "PENDING");
    await inboxRepository.touchConversation(tenantContext, conv.id);
    return inboxRepository.findConversationById(tenantContext, conv.id);
  }
}

export const inboxService = new InboxService();
export default inboxService;