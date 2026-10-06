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
        address: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            productName: true,
            unitPrice: true,
            quantity: true,
            subtotal: true,
            notes: true,
          },
        },
      },
    });
  }

  async findDefaultAddress(tenantContext, customerId) {
    this.assertTenant(tenantContext);

    return prisma.customerAddress.findFirst({
      where: { restaurantId: tenantContext.restaurantId, customerId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }
}

export const phoneOrderRepository = new PhoneOrderRepository();
export default phoneOrderRepository;
