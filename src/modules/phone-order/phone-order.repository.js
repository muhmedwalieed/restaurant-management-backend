import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class PhoneOrderRepository {
  async findRecentOrdersByCustomer(tenantContext, customerId, limit = 5) {
    if (!tenantContext?.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.order.findMany({
      where: { restaurantId: tenantContext.restaurantId, customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
        createdAt: true,
      },
    });
  }

  async findDefaultAddress(tenantContext, customerId) {
    if (!tenantContext?.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.customerAddress.findFirst({
      where: { restaurantId: tenantContext.restaurantId, customerId, isDefault: true, deletedAt: null },
    });
  }
}

export const phoneOrderRepository = new PhoneOrderRepository();
export default phoneOrderRepository;