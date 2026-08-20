import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class KdsRepository {
  /**
   * Finds active kitchen orders for a branch with FIFO ordering (createdAt ASC).
   * By default returns orders in 'CONFIRMED' or 'PREPARING' status.
   */
  async findActiveKitchenOrders(tenantContext, branchId, { page = 1, limit = 20, status } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;

    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      status: status ? status : { in: ["CONFIRMED", "PREPARING"] },
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          items: true,
          table: {
            select: {
              id: true,
              label: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  }
}

export const kdsRepository = new KdsRepository();
export default kdsRepository;
