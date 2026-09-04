import prisma from "../../lib/prisma.js";
import inboxRepository from "./inbox.repository.js";
import whatsAppService from "../whatsapp/whatsapp.service.js";
import templateService from "../templates/template.service.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";
import { paginateResponse } from "../../shared/utils/pagination.js";

export class InboxService {
  async listConversations(tenantContext, query = {}) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

    const result = await inboxRepository.findConversations(tenantContext, {
      page,
      limit,
      status: query.status,
      ticketType: query.ticketType,
      assignedToMe: query.assignedToMe === "true",
      q: query.q,
    });

    return paginateResponse(result.items, result.total, page, limit);
  }

  async getConversation(tenantContext, id) {
    const conv = await inboxRepository.findConversationById(tenantContext, id);
    if (!conv) {
      throw new NotFoundError("Conversation not found or access denied");
    }
    return conv;
  }

  async createFromWhatsApp(tenantContext, conv, customerPhone, options = {}) {
    return this.createTicket(tenantContext, {
      whatsappConversationId: conv?.id || null,
      customerId: conv?.customerId || null,
      customerPhone,
      ticketType: options.ticketType || "SUPPORT",
      subject: options.subject || (options.ticketType === "COMPLAINT" ? "شكوى بخصوص أوردر" : options.ticketType === "ORDER" ? "طلب عبر الواتساب" : "طلب دعم من واتساب"),
      relatedOrderId: options.relatedOrderId || null,
      initialMessage: options.initialMessage || null,
    });
  }

  async createTicket(tenantContext, payload) {
    const ticket = await inboxRepository.createConversation(tenantContext, {
      whatsappConversationId: payload.whatsappConversationId || null,
      customerPhone: payload.customerPhone,
      customerId: payload.customerId || null,
      ticketType: payload.ticketType || "SUPPORT",
      subject: payload.subject,
      relatedOrderId: payload.relatedOrderId || null,
      status: "WAITING",
    });

    if (payload.initialMessage && payload.initialMessage.trim()) {
      await inboxRepository.createMessage(tenantContext, {
        conversationId: ticket.id,
        senderType: "CUSTOMER",
        content: payload.initialMessage.trim(),
        isInternal: false,
      });
    }

    // Sync WhatsApp Bot Conversation to WAITING_AGENT so bot doesn't intercept replies
    try {
      const { automationRepository } = await import("../whatsapp-automation/automation.repository.js");
      const { whatsAppRepository } = await import("../whatsapp/whatsapp.repository.js");
      const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
      if (connection) {
        const waConv = await automationRepository.findConversationByPhone(
          tenantContext,
          connection.id,
          payload.customerPhone
        );
        if (waConv) {
          await automationRepository.updateConversationStatus(tenantContext, waConv.id, "WAITING_AGENT");
        }
      }
    } catch (_) {}

    // Log Ticket Creation
    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: ticket.id,
      actorType: tenantContext.employeeId ? "AGENT" : "CUSTOMER",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "CREATED",
      details: {
        ticketType: ticket.ticketType,
        subject: ticket.subject,
        relatedOrderId: ticket.relatedOrderId,
      },
    });

    // Send WhatsApp Automated Notification to Customer
    try {
      const ticketNum = ticket.ticketNumber ? `#T-${ticket.ticketNumber}` : `#${ticket.id.slice(-4)}`;
      const welcomeMsg = await templateService.render("INBOX_TICKET_CREATED", tenantContext, {
        ticketNumber: ticketNum,
        subject: ticket.subject,
        customerName: ticket.customer?.name || "",
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: ticket.customerPhone,
        text: welcomeMsg,
      });
    } catch {
      // Non-blocking if WhatsApp is disconnected
    }

    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: ticket.id,
      action: "created",
    });

    return this.getConversation(tenantContext, ticket.id);
  }

  async assignConversation(tenantContext, id, agentId) {
    const conv = await this.getConversation(tenantContext, id);
    const targetAgentId = agentId || tenantContext.employeeId;
    if (!targetAgentId) {
      throw new BusinessRuleError("No agent to assign the conversation to");
    }

    // Exclusivity Check: If already claimed by another agent and active, only manager can reassign
    if (conv.assignedAgentId && conv.assignedAgentId !== targetAgentId && conv.status === "ACTIVE") {
      const isManager = tenantContext.permissions?.includes("chats.takeover") ||
        tenantContext.role === "OWNER" ||
        tenantContext.role === "ADMIN";
      if (!isManager) {
        throw new BusinessRuleError("هذه التذكرة قيد المتابعة مع موظف آخر بالفعل.");
      }
    }

    await inboxRepository.assignConversation(tenantContext, id, targetAgentId);

    // Fetch Agent Name for logging and notification
    let agentName = "أحد مسؤولي الدعم";
    try {
      const emp = await prisma.employee.findUnique({
        where: { id: targetAgentId },
        select: { name: true },
      });
      if (emp?.name) agentName = emp.name;
    } catch {
      // fallback
    }

    // Log Ticket Assignment
    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || targetAgentId,
      actorName: agentName,
      action: "ASSIGNED",
      details: { targetAgentId, agentName },
    });

    // Notify Customer on WhatsApp
    try {
      const ticketNum = conv.ticketNumber ? `#T-${conv.ticketNumber}` : `#${conv.id.slice(-4)}`;
      const assignedMsg = await templateService.render("INBOX_AGENT_ASSIGNED", tenantContext, {
        agentName,
        ticketNumber: ticketNum,
        customerName: conv.customer?.name || "",
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: conv.customerPhone,
        text: assignedMsg,
      });
    } catch {
      // Non-blocking
    }

    emitEvent(DomainEvent.CHAT_ASSIGNED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      agentId: targetAgentId,
      customerPhone: conv.customerPhone,
      actorEmployeeId: tenantContext.employeeId || null,
    });
    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "assigned",
      agentId: targetAgentId,
    });

    return this.getConversation(tenantContext, id);
  }

  async reply(tenantContext, id, { content }) {
    const conv = await this.getConversation(tenantContext, id);
    this.assertCanReply(conv, tenantContext);

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

    // Sync WhatsApp Bot Conversation to WAITING_AGENT so bot doesn't intercept customer replies
    try {
      const { automationRepository } = await import("../whatsapp-automation/automation.repository.js");
      const { whatsAppRepository } = await import("../whatsapp/whatsapp.repository.js");
      const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
      if (connection) {
        const waConv = await automationRepository.findConversationByPhone(
          tenantContext,
          connection.id,
          conv.customerPhone
        );
        if (waConv) {
          await automationRepository.updateConversationStatus(tenantContext, waConv.id, "WAITING_AGENT");
        }
      }
    } catch (_) {}

    // Log reply
    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "REPLIED",
      details: { contentLength: content.length },
    });

    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "replied",
    });

    return this.getConversation(tenantContext, id);
  }

  async addNote(tenantContext, id, { content }) {
    const conv = await this.getConversation(tenantContext, id);
    this.assertCanModify(conv, tenantContext.employeeId);

    await inboxRepository.createMessage(tenantContext, {
      conversationId: id,
      senderType: "AGENT",
      content,
      isInternal: true,
      agentId: tenantContext.employeeId || null,
    });
    await inboxRepository.touchConversation(tenantContext, id);

    // Log internal note
    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "NOTE_ADDED",
      details: { contentLength: content.length },
    });

    return this.getConversation(tenantContext, id);
  }

  async resolveConversation(tenantContext, id) {
    const conv = await this.getConversation(tenantContext, id);
    this.assertCanModify(conv, tenantContext.employeeId);
    await inboxRepository.updateStatus(tenantContext, id, "RESOLVED");

    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "RESOLVED",
    });

    return this.getConversation(tenantContext, id);
  }

  async closeConversation(tenantContext, id, resolutionData = {}) {
    const conv = await this.getConversation(tenantContext, id);
    if (conv.status === "CLOSED") {
      throw new BusinessRuleError("هذه التذكرة مغلقة بالفعل.");
    }
    this.assertCanModify(conv, tenantContext.employeeId);

    await inboxRepository.closeConversation(tenantContext, id, {
      resolutionStatus: resolutionData.resolutionStatus || "RESOLVED",
      resolutionCategory: resolutionData.resolutionCategory || "GENERAL_INQUIRY",
      resolutionNotes: resolutionData.resolutionNotes || "",
      closedByEmployeeId: tenantContext.employeeId || null,
    });

    // Set WhatsApp Bot Conversation state to AWAITING_SUPPORT_FEEDBACK
    try {
      const { automationRepository } = await import("../whatsapp-automation/automation.repository.js");
      const { whatsAppRepository } = await import("../whatsapp/whatsapp.repository.js");
      const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
      if (connection) {
        const waConv = await automationRepository.findConversationByPhone(
          tenantContext,
          connection.id,
          conv.customerPhone
        );
        if (waConv) {
          await automationRepository.updateConversation(tenantContext, waConv.id, {
            state: "WELCOME",
            status: "ACTIVE",
            cart: [],
            selectedCategoryId: null,
            address: null,
            lastInboundAt: new Date(),
          });
        }
      }
    } catch (_) {}

    // Log ticket closure
    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "CLOSED",
      details: {
        resolutionStatus: resolutionData.resolutionStatus || "RESOLVED",
        resolutionCategory: resolutionData.resolutionCategory || "GENERAL_INQUIRY",
        resolutionNotes: resolutionData.resolutionNotes || "",
      },
    });

    // Send WhatsApp Feedback Survey to Customer
    try {
      const ticketNum = conv.ticketNumber ? `#T-${conv.ticketNumber}` : `#${conv.id.slice(-4)}`;
      const feedbackPrompt = await templateService.render("INBOX_TICKET_CLOSED_SURVEY", tenantContext, {
        ticketNumber: ticketNum,
        customerName: conv.customer?.name || "",
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: conv.customerPhone,
        text: feedbackPrompt,
      });
    } catch {
      // Non-blocking
    }

    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "closed",
    });

    return this.getConversation(tenantContext, id);
  }

  async submitCustomerFeedback(tenantContext, id, { rating, resolved, nps, comment } = {}) {
    const conv = await this.getConversation(tenantContext, id);
    await inboxRepository.submitFeedback(tenantContext, id, { rating, resolved, nps, comment });

    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "CUSTOMER",
      action: "FEEDBACK_RECEIVED",
      details: { rating, resolved, nps, comment },
    });

    // Thank Customer on WhatsApp
    try {
      const thankYou = await templateService.render("INBOX_FEEDBACK_THANK_YOU", tenantContext, {
        customerName: conv.customer?.name || "",
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: conv.customerPhone,
        text: thankYou,
      });
    } catch {
      // Non-blocking
    }

    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "feedback_received",
    });

    return this.getConversation(tenantContext, id);
  }

  assertCanModify(conv, employeeId) {
    if (conv.status === "CLOSED") {
      throw new BusinessRuleError("هذه التذكرة مغلقة.");
    }
    if (conv.lockedById && conv.lockedById !== employeeId) {
      throw new BusinessRuleError("هذه المحادثة مقفلة من قِبل المشرف. المشرف المسؤول فقط يمكنه إجراء التعديلات.");
    }
  }

  assertCanReply(conv, tenantContext) {
    if (conv.status === "CLOSED") {
      throw new BusinessRuleError("لا يمكن إرسال رسائل في تذكرة مغلقة.");
    }
    if (conv.lockedById && conv.lockedById !== tenantContext.employeeId) {
      throw new BusinessRuleError("هذه المحادثة مقفلة من قِبل المشرف. المشرف المسؤول فقط يمكنه إرسال الردود.");
    }

    const isLockOwner = Boolean(conv.lockedById && conv.lockedById === tenantContext.employeeId);
    const isOwnerOrAdmin = tenantContext.role?.toLowerCase() === "owner" || tenantContext.role?.toLowerCase() === "admin";

    // Staff must claim/assign the ticket before sending replies
    if (!conv.assignedAgentId && !isOwnerOrAdmin) {
      throw new BusinessRuleError("يجب تولّي التذكرة أولاً قبل إرسال الردود.");
    }

    // Exclusivity Check: If assigned to another agent and not the lock owner or owner/admin
    if (conv.assignedAgentId && conv.assignedAgentId !== tenantContext.employeeId && !isLockOwner && !isOwnerOrAdmin) {
      throw new BusinessRuleError("هذه التذكرة مخصصة لموظف آخر. لا يمكنك الرد عليها إلا بعد قيام المشرف بتحويلها.");
    }
  }

  async takeover(tenantContext, id) {
    const conv = await this.getConversation(tenantContext, id);
    await inboxRepository.lockConversation(tenantContext, id, tenantContext.employeeId);

    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "TAKEOVER",
      details: { lockedById: tenantContext.employeeId },
    });

    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "takeover",
    });
    return this.getConversation(tenantContext, id);
  }

  async returnToAgent(tenantContext, id) {
    await this.getConversation(tenantContext, id);
    await inboxRepository.clearLock(tenantContext, id);

    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "RETURNED_TO_AGENT",
    });

    return this.getConversation(tenantContext, id);
  }

  async reassign(tenantContext, id, agentId) {
    const conv = await this.getConversation(tenantContext, id);
    if (!agentId) {
      throw new BusinessRuleError("Target agentId is required for reassignment");
    }
    await inboxRepository.reassignConversation(tenantContext, id, agentId);

    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: id,
      actorType: "AGENT",
      actorId: tenantContext.employeeId || null,
      actorName: tenantContext.employeeName || null,
      action: "REASSIGNED",
      details: { newAgentId: agentId },
    });

    return this.getConversation(tenantContext, id);
  }

  async recordCustomerMessage(tenantContext, whatsappConversationId, customerPhone, content) {
    let conv = null;

    if (whatsappConversationId) {
      conv = await inboxRepository.findConversationByWhatsAppId(
        tenantContext,
        whatsappConversationId
      );
    }

    if (!conv) {
      conv = await inboxRepository.findActiveConversationByPhone(tenantContext, customerPhone);
    }

    if (!conv) {
      conv = await inboxRepository.createConversation(tenantContext, {
        whatsappConversationId: whatsappConversationId || null,
        customerPhone,
        ticketType: "SUPPORT",
        status: "WAITING",
      });

      await inboxRepository.createTicketLog(tenantContext, {
        conversationId: conv.id,
        actorType: "CUSTOMER",
        action: "CREATED",
        details: { customerPhone, source: "WHATSAPP_INBOUND" },
      });
    }

    await inboxRepository.createMessage(tenantContext, {
      conversationId: conv.id,
      senderType: "CUSTOMER",
      content: content || "",
      isInternal: false,
    });

    await inboxRepository.updateStatus(tenantContext, conv.id, "PENDING");
    await inboxRepository.touchConversation(tenantContext, conv.id);

    // Log message received
    await inboxRepository.createTicketLog(tenantContext, {
      conversationId: conv.id,
      actorType: "CUSTOMER",
      action: "MESSAGE_RECEIVED",
      details: { contentLength: (content || "").length },
    });

    // Ensure WhatsApp bot conversation is in WAITING_AGENT status
    try {
      const { automationRepository } = await import("../whatsapp-automation/automation.repository.js");
      const { whatsAppRepository } = await import("../whatsapp/whatsapp.repository.js");
      const connection = await whatsAppRepository.findConnectionByTenant(tenantContext);
      if (connection) {
        const waConv = await automationRepository.findConversationByPhone(
          tenantContext,
          connection.id,
          customerPhone
        );
        if (waConv && waConv.status !== "WAITING_AGENT") {
          await automationRepository.updateConversationStatus(tenantContext, waConv.id, "WAITING_AGENT");
        }
      }
    } catch (_) {}

    // Emit Realtime Event to Socket so UI updates immediately
    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: conv.id,
      action: "message_received",
      customerPhone,
    });

    return inboxRepository.findConversationById(tenantContext, conv.id);
  }
}

export const inboxService = new InboxService();
export default inboxService;
