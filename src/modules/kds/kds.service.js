import kdsRepository from "./kds.repository.js";
import branchRepository from "../branches/branch.repository.js";
import orderService from "../orders/order.service.js";
import { NotFoundError } from "../../shared/errors/index.js";

export class KdsService {
  async verifyBranchOwnership(tenantContext, branchId) {
    const branch = await branchRepository.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }
    return branch;
  }

  /**
   * Retrieves active kitchen orders (CONFIRMED and PREPARING by default) ordered FIFO.
   * Server-side calculates elapsedMinutes from createdAt.
   */
  async getActiveKitchenOrders(tenantContext, branchId, { page = 1, limit = 20, status } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);

    const { items, total } = await kdsRepository.findActiveKitchenOrders(tenantContext, branchId, {
      page,
      limit,
      status,
    });

    const now = Date.now();
    const formattedItems = items.map((order) => {
      const elapsedMs = now - new Date(order.createdAt).getTime();
      const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        type: order.type,
        source: order.source,
        status: order.status,
        tableLabel: order.table ? order.table.label : null,
        tableId: order.tableId,
        notes: order.notes,
        version: order.version,
        createdAt: order.createdAt,
        elapsedMinutes,
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
          notes: item.notes,
          selectedModifiers: item.selectedModifiers,
        })),
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: formattedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Delegates kitchen preparation status update directly to existing Order Engine.
   * Preserves single source of truth for State Machine validation (422) & Optimistic Locking (409).
   */
  async updateKitchenOrderStatus(tenantContext, branchId, orderId, { newStatus, expectedVersion, reason }) {
    return orderService.updateOrderStatus(tenantContext, branchId, orderId, {
      newStatus,
      expectedVersion,
      reason,
    });
  }
}

export const kdsService = new KdsService();
export default kdsService;
