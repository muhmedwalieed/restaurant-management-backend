import prisma from "../../lib/prisma.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";

export class TableSessionRepository {
  async findTableByQrToken(qrToken, restaurantId) {

    const rows = await prisma.$queryRaw`
      SELECT id, restaurant_id, branch_id, label FROM tables WHERE qr_token = ${qrToken} AND restaurant_id = ${restaurantId} AND deleted_at IS NULL LIMIT 1
    `;
    const r = rows && rows[0];
    return r
      ? { id: r.id, restaurantId: r.restaurant_id, branchId: r.branch_id, label: r.label }
      : null;
  }

  async findActiveSessionByTable(restaurantId, tableId) {
    return prisma.tableSession.findFirst({
      where: { restaurantId, tableId, status: { in: ["ACTIVE", "AWAITING_CONFIRMATION", "CONFIRMED"] } },
      orderBy: { createdAt: "asc" },
    });
  }

  async findSessionById(restaurantId, sessionId) {
    return prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: {
        members: true,
        items: { orderBy: { createdAt: "asc" } },
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: { orderBy: { createdAt: "asc" } } },
        },
        waiterCalls: {
          where: { status: { in: ["PENDING", "ACCEPTED"] } },
          orderBy: { createdAt: "asc" },
        },
        table: { select: { id: true, label: true } },
      },
    });
  }

  async createSession(restaurantId, branchId, tableId, pinHash, pin, createdByEmployeeId) {
    try {
      return await prisma.tableSession.create({
        data: { restaurantId, branchId, tableId, pinHash, pin, createdByEmployeeId },
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new BusinessRuleError("This table already has an active session");
      }
      throw error;
    }
  }

  async setSessionStatus(restaurantId, sessionId, status, { confirmedOrderId = null } = {}) {
    await prisma.tableSession.updateMany({
      where: { id: sessionId, restaurantId },
      data: {
        status,
        ...(confirmedOrderId ? { confirmedOrderId } : {}),
        ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
      },
    });
    return this.findSessionById(restaurantId, sessionId);
  }

  async nextOrderNumber(sessionId) {
    const last = await prisma.tableSessionOrder.findFirst({
      where: { sessionId },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    return (last?.orderNumber || 0) + 1;
  }

  async createOrder(sessionId, orderNumber, total) {
    return prisma.tableSessionOrder.create({
      data: { sessionId, orderNumber, total },
    });
  }

  async linkItemsToOrder(sessionId, orderId) {
    await prisma.tableSessionItem.updateMany({
      where: { sessionId, sessionOrderId: null },
      data: { sessionOrderId: orderId },
    });
  }

  async findPendingOrder(sessionId) {
    return prisma.tableSessionOrder.findFirst({
      where: { sessionId, status: "AWAITING_CONFIRMATION" },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
  }

  async confirmOrder(sessionId, orderId, realOrderId, total, txClient = null) {
    const client = txClient || prisma;
    const result = await client.tableSessionOrder.updateMany({
      where: { id: orderId, sessionId, status: "AWAITING_CONFIRMATION" },
      data: {
        status: "CONFIRMED",
        orderId: realOrderId,
        total,
        confirmedAt: new Date(),
      },
    });
    return result.count;
  }

  async cancelPendingOrders(sessionId) {
    await prisma.tableSessionOrder.updateMany({
      where: { sessionId, status: "AWAITING_CONFIRMATION" },
      data: { status: "CANCELLED" },
    });
  }

  async unlinkOrderItems(sessionId, orderId) {
    await prisma.tableSessionItem.updateMany({
      where: { sessionId, sessionOrderId: orderId },
      data: { sessionOrderId: null },
    });
  }

  async updatePin(sessionId, restaurantId, pin, pinHash) {
    await prisma.tableSession.updateMany({
      where: { id: sessionId, restaurantId },
      data: { pin, pinHash },
    });
  }

  async setTableStatus(tableId, restaurantId, status) {
    const where =
      status === "AVAILABLE"
        ? { id: tableId, restaurantId, status: "OCCUPIED" }
        : { id: tableId, restaurantId };
    await prisma.restaurantTable.updateMany({ where, data: { status } });
  }

  async addMember(restaurantId, sessionId, name) {
    const member = await prisma.tableSessionMember.create({
      data: { sessionId, name },
    });
    return member;
  }

  async addItem(restaurantId, sessionId, { productId, productName, unitPrice, quantity, addedByName }) {
    return prisma.tableSessionItem.create({
      data: { sessionId, productId, productName, unitPrice, quantity, addedByName },
    });
  }

  async updateItemQuantity(sessionId, itemId, quantity) {
    await prisma.tableSessionItem.updateMany({
      where: { id: itemId, sessionId },
      data: { quantity },
    });
  }

  async deleteItem(sessionId, itemId) {
    await prisma.tableSessionItem.deleteMany({
      where: { id: itemId, sessionId },
    });
  }

  async lockout(sessionId, restaurantId, failedAttempts, lockoutLevel, lockoutUntil) {
    await prisma.tableSession.updateMany({
      where: { id: sessionId, restaurantId },
      data: { failedAttempts, lockoutLevel, lockoutUntil },
    });
  }

  async findSessionsByBranch(restaurantId, branchId) {
    return prisma.tableSession.findMany({
      where: { restaurantId, branchId, status: { in: ["ACTIVE", "AWAITING_CONFIRMATION", "CONFIRMED"] } },
      include: {
        members: true,
        items: { orderBy: { createdAt: "asc" } },
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: { orderBy: { createdAt: "asc" } } },
        },
        waiterCalls: {
          where: { status: { in: ["PENDING", "ACCEPTED"] } },
          orderBy: { createdAt: "asc" },
        },
        table: { select: { id: true, label: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findActiveWaiterCall(sessionId, restaurantId) {
    return prisma.tableSessionWaiterCall.findFirst({
      where: { sessionId, restaurantId, status: { in: ["PENDING", "ACCEPTED"] } },
      orderBy: { createdAt: "asc" },
    });
  }

  async createWaiterCall(data) {
    return prisma.tableSessionWaiterCall.create({ data });
  }

  async acceptWaiterCall(callId, restaurantId, employeeId) {
    return prisma.tableSessionWaiterCall.updateMany({
      where: { id: callId, restaurantId, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedByEmployeeId: employeeId, acceptedAt: new Date() },
    });
  }

  async dismissWaiterCall(callId, restaurantId) {
    return prisma.tableSessionWaiterCall.updateMany({
      where: { id: callId, restaurantId, status: { in: ["PENDING", "ACCEPTED"] } },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    });
  }
}

export const tableSessionRepository = new TableSessionRepository();
export default tableSessionRepository;
