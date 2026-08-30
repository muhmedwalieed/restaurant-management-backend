import prisma from "../../lib/prisma.js";
import { BaseRepository, CUSTOMER_SUMMARY_SELECT } from "../../shared/repositories/base.repository.js";

export class AutomationRepository extends BaseRepository {

  async findConversationByPhone(tenantContext, connectionId, customerPhone) {
    this.assertTenant(tenantContext);

    return prisma.whatsAppConversation.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        connectionId,
        customerPhone,
      },
    });
  }

  async findConversationById(tenantContext, id) {
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);
    const { skip, take } = this.getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where,
        skip,
        take,
        orderBy: { lastInboundAt: "desc" },
        include: {
          customer: {
            select: CUSTOMER_SUMMARY_SELECT,
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
