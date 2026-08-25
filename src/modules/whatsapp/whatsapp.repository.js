import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class WhatsAppRepository {

  async findConnectionByTenant(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConnection.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findConnectionById(tenantContext, id) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConnection.findFirst({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  async findConnectionByAccountId(tenantContext, providerAccountId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConnection.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        providerAccountId,
      },
    });
  }

  async findConnectionByPhoneNumberId(providerPhoneNumberId) {
    if (!providerPhoneNumberId) return null;

    const candidateRestaurant = await prisma.restaurant.findFirst({
      where: {
        whatsappConnections: {
          some: {
            providerPhoneNumberId,
            status: "ACTIVE",
          },
        },
        status: "ACTIVE",
      },
    });

    if (!candidateRestaurant) return null;

    return prisma.whatsAppConnection.findFirst({
      where: {
        restaurantId: candidateRestaurant.id,
        providerPhoneNumberId,
        status: "ACTIVE",
      },
    });
  }

  async createConnectionTransaction(tenantContext, connectionData) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {

      if (connectionData.status === "ACTIVE" || connectionData.status === undefined) {
        await tx.whatsAppConnection.updateMany({
          where: {
            restaurantId,
            status: "ACTIVE",
          },
          data: {
            status: "DISCONNECTED",
            updatedAt: new Date(),
          },
        });
      }

      return tx.whatsAppConnection.create({
        data: {
          restaurantId,
          provider: connectionData.provider || "META",
          providerAccountId: connectionData.providerAccountId,
          providerPhoneNumberId: connectionData.providerPhoneNumberId,
          displayName: connectionData.displayName || null,
          webhookSecret: connectionData.webhookSecret || null,
          status: connectionData.status || "ACTIVE",
        },
      });
    });
  }

  async updateConnectionTransaction(tenantContext, connectionId, data) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      if (data.status === "ACTIVE") {
        await tx.whatsAppConnection.updateMany({
          where: {
            restaurantId,
            id: { not: connectionId },
            status: "ACTIVE",
          },
          data: {
            status: "DISCONNECTED",
            updatedAt: new Date(),
          },
        });
      }

      return tx.whatsAppConnection.updateMany({
        where: {
          id: connectionId,
          restaurantId,
        },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    });
  }

  async softDeactivateConnection(tenantContext, connectionId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppConnection.updateMany({
      where: {
        id: connectionId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "DISCONNECTED",
        updatedAt: new Date(),
      },
    });
  }

  async createMessage(tenantContext, messageData) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppMessage.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        connectionId: messageData.connectionId,
        direction: messageData.direction,
        type: messageData.type || "TEXT",
        fromPhone: messageData.fromPhone,
        toPhone: messageData.toPhone,
        content: messageData.content || null,
        mediaUrl: messageData.mediaUrl || null,
        providerMessageId: messageData.providerMessageId || null,
        status: messageData.status || "PENDING",
      },
    });
  }

  async findMessagesByTenant(tenantContext, { page = 1, limit = 20, direction, status, q } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { fromPhone: { contains: q, mode: "insensitive" } },
              { toPhone: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.whatsAppMessage.count({ where }),
    ]);

    return { items, total };
  }

  async findMessageById(tenantContext, id) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppMessage.findFirst({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  async findMessageByProviderId(tenantContext, providerMessageId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppMessage.findFirst({
      where: {
        providerMessageId,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  async updateMessageStatus(tenantContext, messageId, status) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.whatsAppMessage.updateMany({
      where: {
        id: messageId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  async findEventByEventId(tenantContext, eventId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.webhookEvent.findFirst({
      where: {
        eventId,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  async createEvent(tenantContext, eventData) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.webhookEvent.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        eventId: eventData.eventId,
        provider: eventData.provider || "META",
        rawPayload: eventData.rawPayload,
        status: eventData.status || "RECEIVED",
      },
    });
  }

  async markEventProcessed(tenantContext, eventId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.webhookEvent.updateMany({
      where: {
        eventId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });
  }

  async markEventFailed(tenantContext, eventId, lastError) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.webhookEvent.updateMany({
      where: {
        eventId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "FAILED",
        lastError,
        attempts: { increment: 1 },
      },
    });
  }

  async findFailedEvents(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.webhookEvent.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        status: "FAILED",
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const whatsAppRepository = new WhatsAppRepository();
export default whatsAppRepository;
