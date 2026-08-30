import prisma from "../../lib/prisma.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class PhoneOrderRepository extends BaseRepository {
  async findRecentOrdersByCustomer(tenantContext, customerId, limit = 5) {
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

    return prisma.customerAddress.findFirst({
      where: { restaurantId: tenantContext.restaurantId, customerId, isDefault: true, deletedAt: null },
    });
  }
}

export const phoneOrderRepository = new PhoneOrderRepository();
export default phoneOrderRepository;
