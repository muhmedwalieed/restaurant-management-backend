import prisma from "../../lib/prisma.js";
import { BaseRepository, assertTenantContext, CUSTOMER_SUMMARY_SELECT, ACTOR_SUMMARY_SELECT } from "../../shared/repositories/base.repository.js";
import { getPhoneVariants } from "../../shared/utils/phone.js";

export class InboxRepository extends BaseRepository {
  async findConversations(tenantContext, { page = 1, limit = 20, status, ticketType, assignedToMe, q } = {}) {
    this.assertTenant(tenantContext);
    const { skip, take } = this.getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(status ? { status } : {}),
      ...(ticketType ? { ticketType } : {}),
      ...(assignedToMe ? { assignedAgentId: tenantContext.employeeId } : {}),
      ...(q
        ? {
            OR: [
              { customerPhone: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.inboxConversation.findMany({
        where,
        skip,
        take,
        orderBy: { lastMessageAt: "desc" },
        include: {
          customer: { select: CUSTOMER_SUMMARY_SELECT },
          assignedAgent: { select: ACTOR_SUMMARY_SELECT },
          relatedOrder: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              createdAt: true,
            },
          },
          _count: { select: { messages: true } },
        },
      }),
      prisma.inboxConversation.count({ where }),
    ]);

    return { items, total };
  }

  async findConversationById(tenantContext, id) {
    this.assertTenant(tenantContext);

    return prisma.inboxConversation.findFirst({
      where: { id, restaurantId: tenantContext.restaurantId },
      include: {
        customer: { select: CUSTOMER_SUMMARY_SELECT },
        assignedAgent: { select: ACTOR_SUMMARY_SELECT },
        closedBy: { select: ACTOR_SUMMARY_SELECT },
        whatsappConversation: { select: { id: true, customerPhone: true, status: true } },
        relatedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
            notes: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            agent: { select: ACTOR_SUMMARY_SELECT },
          },
        },
        logs: {
          orderBy: { createdAt: "desc" },
          include: {
            actor: { select: ACTOR_SUMMARY_SELECT },
          },
        },
      },
    });
  }

  async findActiveConversationByPhone(tenantContext, customerPhone) {
    this.assertTenant(tenantContext);
    const variants = getPhoneVariants(customerPhone);

    return prisma.inboxConversation.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        customerPhone: { in: variants },
        status: { in: ["WAITING", "ACTIVE", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findConversationByWhatsAppId(tenantContext, whatsappConversationId) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        whatsappConversationId,
        status: { in: ["WAITING", "ACTIVE", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createConversation(tenantContext, data) {
    assertTenantContext(tenantContext);

    const count = await prisma.inboxConversation.count({
      where: { restaurantId: tenantContext.restaurantId },
    });
    const ticketNumber = count + 1;

    return prisma.inboxConversation.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        whatsappConversationId: data.whatsappConversationId || null,
        customerId: data.customerId || null,
        customerPhone: data.customerPhone,
        assignedAgentId: data.assignedAgentId || null,
        relatedOrderId: data.relatedOrderId || null,
        ticketType: data.ticketType || "SUPPORT",
        ticketNumber,
        subject: data.subject || (data.ticketType === "COMPLAINT" ? "شكوى بخصوص أوردر" : data.ticketType === "ORDER" ? "طلب عبر الواتساب" : "محادثة دعم فني"),
        status: data.status || "WAITING",
      },
      include: {
        customer: { select: CUSTOMER_SUMMARY_SELECT },
        assignedAgent: { select: ACTOR_SUMMARY_SELECT },
      },
    });
  }

  async assignConversation(tenantContext, id, agentId) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: { assignedAgentId: agentId, status: "ACTIVE", updatedAt: new Date() },
    });
  }

  async updateStatus(tenantContext, id, status) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: { status, updatedAt: new Date() },
    });
  }

  async lockConversation(tenantContext, id, lockedById) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: { lockedById, lockedAt: new Date(), updatedAt: new Date() },
    });
  }

  async clearLock(tenantContext, id) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: { lockedById: null, lockedAt: null, updatedAt: new Date() },
    });
  }

  async reassignConversation(tenantContext, id, agentId) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: { assignedAgentId: agentId, lockedById: null, lockedAt: null, status: "ACTIVE", updatedAt: new Date() },
    });
  }

  async touchConversation(tenantContext, id) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: { lastMessageAt: new Date(), updatedAt: new Date() },
    });
  }

  async closeConversation(tenantContext, id, { resolutionStatus, resolutionCategory, resolutionNotes, closedByEmployeeId } = {}) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: {
        status: "CLOSED",
        resolutionStatus: resolutionStatus || "RESOLVED",
        resolutionCategory: resolutionCategory || "GENERAL_INQUIRY",
        resolutionNotes: resolutionNotes || "",
        closedByEmployeeId: closedByEmployeeId || null,
        closedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async submitFeedback(tenantContext, id, { rating, resolved, nps, comment } = {}) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.updateMany({
      where: { id, restaurantId: tenantContext.restaurantId },
      data: {
        feedbackRating: rating,
        feedbackResolved: resolved ?? null,
        feedbackNps: nps ?? null,
        feedbackComment: comment ?? null,
        feedbackSubmittedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async findLastClosedTicketByPhone(tenantContext, customerPhone) {
    assertTenantContext(tenantContext);
    const variants = getPhoneVariants(customerPhone);

    return prisma.inboxConversation.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        customerPhone: { in: variants },
        status: "CLOSED",
        closedAt: { not: null },
        feedbackRating: null,
      },
      orderBy: { closedAt: "desc" },
    });
  }

  async createTicketLog(tenantContext, { conversationId, actorType, actorId, actorName, action, details }) {
    assertTenantContext(tenantContext);

    return prisma.inboxTicketLog.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        conversationId,
        actorType: actorType || "AGENT",
        actorId: actorId || null,
        actorName: actorName || null,
        action,
        details: details || null,
      },
    });
  }

  async createMessage(tenantContext, data) {
    assertTenantContext(tenantContext);

    return prisma.inboxMessage.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        conversationId: data.conversationId,
        senderType: data.senderType,
        content: data.content,
        isInternal: data.isInternal ?? false,
        agentId: data.agentId || null,
      },
    });
  }
}

export const inboxRepository = new InboxRepository();
export default inboxRepository;
