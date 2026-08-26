import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class AutomationRepository {

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
          select: { id: true, name: true, firstName: true, lastName: true, phone: true },
        },
        connection: {
          select: { id: true, displayName: true, providerPhoneNumberId: true },
        },
      },
    });
  }

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
