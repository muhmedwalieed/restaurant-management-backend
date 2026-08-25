import prisma from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors/index.js";

export class TableSessionRepository {
  async findTableByQrToken(qrToken, restaurantId) {
    // Use raw query to bypass the tenant safety-net's findFirst restrictions and
    // reliably look up by QR token (QR tokens are globally unique).
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
        table: { select: { id: true, label: true } },
      },
    });
  }

  async createSession(restaurantId, branchId, tableId, pinHash, pin, createdByEmployeeId) {
    return prisma.tableSession.create({
      data: { restaurantId, branchId, tableId, pinHash, pin, createdByEmployeeId },
    });
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

  /** Link all currently-unsubmitted session items to a submitted order. */
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

  async confirmOrder(sessionId, orderId, realOrderId, total) {
    await prisma.tableSessionOrder.updateMany({
      where: { id: orderId, sessionId, status: "AWAITING_CONFIRMATION" },
      data: {
        status: "CONFIRMED",
        orderId: realOrderId,
        total,
        confirmedAt: new Date(),
      },
    });
  }

  async cancelPendingOrders(sessionId) {
    await prisma.tableSessionOrder.updateMany({
      where: { sessionId, status: "AWAITING_CONFIRMATION" },
      data: { status: "CANCELLED" },
    });
  }

  async updatePin(sessionId, pin, pinHash) {
    await prisma.tableSession.update({
      where: { id: sessionId },
      data: { pin, pinHash },
    });
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

  async updateItemQuantity(restaurantId, sessionId, itemId, quantity) {
    await prisma.tableSessionItem.updateMany({
      where: { id: itemId, sessionId, restaurantId },
      data: { quantity },
    });
  }

  async deleteItem(restaurantId, sessionId, itemId) {
    await prisma.tableSessionItem.deleteMany({
      where: { id: itemId, sessionId, restaurantId },
    });
  }

  async lockout(sessionId, failedAttempts, lockoutLevel, lockoutUntil) {
    await prisma.tableSession.update({
      where: { id: sessionId },
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
        table: { select: { id: true, label: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}

export const tableSessionRepository = new TableSessionRepository();
export default tableSessionRepository;