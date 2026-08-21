import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class AutomationRepository {
  /**
   * Finds a conversation by customerPhone and connectionId under tenant context.
   */
  async findConversationByPhone(tenantContext, connectionId, customerPhone) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConversation.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        connectionId,
        customerPhone,
      },
    });
  }

  /**
   * Finds conversation by ID under tenant context.
   */
  async findConversationById(tenantContext, id) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConversation.findFirst({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        connection: {
          select: { id: true, displayName: true, providerPhoneNumberId: true },
        },
      },
    });
  }

  /**
   * Creates a new WhatsAppConversation record.
   */
  async createConversation(tenantContext, data) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConversation.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        connectionId: data.connectionId,
        customerPhone: data.customerPhone,
        customerId: data.customerId || null,
        state: data.state || "WELCOME",
        status: data.status || "ACTIVE",
        cart: data.cart || [],
        address: data.address || null,
        selectedCategoryId: data.selectedCategoryId || null,
        lastInboundAt: new Date(),
      },
    });
  }

  /**
   * Updates a WhatsAppConversation record (ADR-021).
   */
  async updateConversation(tenantContext, id, data) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConversation.updateMany({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Resets and re-opens a conversation back to WELCOME state and ACTIVE status (ADR-021).
   */
  async resetConversation(tenantContext, id) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConversation.updateMany({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        state: "WELCOME",
        status: "ACTIVE",
        cart: [],
        address: null,
        selectedCategoryId: null,
        lastInboundAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Updates conversation status (ACTIVE / WAITING_AGENT / CLOSED).
   */
  async updateConversationStatus(tenantContext, id, status) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConversation.updateMany({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Lists conversations with pagination and optional status filter.
   */
  async listConversations(tenantContext, { page = 1, limit = 20, status } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastInboundAt: "desc" },
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
        },
      }),
      prisma.whatsAppConversation.count({ where }),
    ]);

    return { items, total };
  }
}

export const automationRepository = new AutomationRepository();
export default automationRepository;
