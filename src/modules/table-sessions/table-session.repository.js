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
        table: { select: { id: true, label: true } },
      },
    });
  }

  async createSession(restaurantId, branchId, tableId, pinHash, createdByEmployeeId) {
    return prisma.tableSession.create({
      data: { restaurantId, branchId, tableId, pinHash, createdByEmployeeId },
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
}

export const tableSessionRepository = new TableSessionRepository();
export default tableSessionRepository;