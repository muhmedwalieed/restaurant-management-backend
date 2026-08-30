import prisma from "../../lib/prisma.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class KdsRepository extends BaseRepository {

  async findActiveKitchenOrders(tenantContext, branchId, { page = 1, limit = 20, status } = {}) {
    this.assertTenant(tenantContext);
    const { skip, take } = this.getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      status: status ? status : { in: ["CONFIRMED", "PREPARING"] },
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
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
