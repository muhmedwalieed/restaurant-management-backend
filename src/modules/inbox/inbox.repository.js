import prisma from "../../lib/prisma.js";
import { assertTenantContext } from "../../shared/middleware/tenant-context.js";
import { getPaginationOffset } from "../../shared/utils/pagination.js";

export class InboxRepository {
  async findConversations(tenantContext, { page = 1, limit = 20, status, assignedToMe } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(status ? { status } : {}),
      ...(assignedToMe ? { assignedAgentId: tenantContext.employeeId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.inboxConversation.findMany({
        where,
        skip,
        take,
        orderBy: { lastMessageAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          assignedAgent: { select: { id: true, name: true, email: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.inboxConversation.count({ where }),
    ]);

    return { items, total };
  }

  async findConversationById(tenantContext, id) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.findFirst({
      where: { id, restaurantId: tenantContext.restaurantId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
        whatsappConversation: { select: { id: true, customerPhone: true, status: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async findConversationByWhatsAppId(tenantContext, whatsappConversationId) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.findFirst({
      where: { restaurantId: tenantContext.restaurantId, whatsappConversationId },
    });
  }

  async createConversation(tenantContext, data) {
    assertTenantContext(tenantContext);

    return prisma.inboxConversation.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        whatsappConversationId: data.whatsappConversationId || null,
        customerId: data.customerId || null,
        customerPhone: data.customerPhone,
        assignedAgentId: data.assignedAgentId || null,
        relatedOrderId: data.relatedOrderId || null,
        status: data.status || "WAITING",
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
