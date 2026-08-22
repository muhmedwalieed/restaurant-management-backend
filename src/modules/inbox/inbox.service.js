import inboxRepository from "./inbox.repository.js";
import whatsAppService from "../whatsapp/whatsapp.service.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
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

    emitEvent(DomainEvent.CHAT_ASSIGNED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      agentId: targetAgentId,
      customerPhone: conv.customerPhone,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return this.getConversation(tenantContext, id);
  }

  async reply(tenantContext, id, { content }) {
    const conv = await this.getConversation(tenantContext, id);
    this.assertCanModify(conv, tenantContext.employeeId);

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
    this.assertCanModify(conv, tenantContext.employeeId);

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
    const conv = await this.getConversation(tenantContext, id);
    this.assertCanModify(conv, tenantContext.employeeId);
    await inboxRepository.updateStatus(tenantContext, id, "RESOLVED");
    return this.getConversation(tenantContext, id);
  }

  async closeConversation(tenantContext, id) {
    const conv = await this.getConversation(tenantContext, id);
    this.assertCanModify(conv, tenantContext.employeeId);
    await inboxRepository.updateStatus(tenantContext, id, "CLOSED");
    return this.getConversation(tenantContext, id);
  }

  // ==================== MANAGER MONITORING & TAKEOVER (Module 12) ====================

  /**
   * Throws if the conversation is locked by another user (manager takeover).
   */
  assertCanModify(conv, employeeId) {
    if (conv.lockedById && conv.lockedById !== employeeId) {
      throw new BusinessRuleError("This conversation is locked by a manager. Only the manager who took it over can act on it.");
    }
  }

  /**
   * Manager takes over a conversation: locks it on the manager (assigned agent is locked out).
   */
  async takeover(tenantContext, id) {
    const conv = await this.getConversation(tenantContext, id);
    await inboxRepository.lockConversation(tenantContext, id, tenantContext.employeeId);
    return this.getConversation(tenantContext, id);
  }

  /**
   * Manager returns the conversation to the assigned agent (clears the lock).
   */
  async returnToAgent(tenantContext, id) {
    await this.getConversation(tenantContext, id);
    await inboxRepository.clearLock(tenantContext, id);
    return this.getConversation(tenantContext, id);
  }

  /**
   * Manager reassigns the conversation to a different agent (clears the lock).
   */
  async reassign(tenantContext, id, agentId) {
    const conv = await this.getConversation(tenantContext, id);
    if (!agentId) {
      throw new BusinessRuleError("Target agentId is required for reassignment");
    }
    await inboxRepository.reassignConversation(tenantContext, id, agentId);
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