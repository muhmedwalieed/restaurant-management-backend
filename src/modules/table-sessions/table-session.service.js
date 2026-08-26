import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import tableSessionRepository from "./table-session.repository.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import { NotFoundError, ValidationError, BusinessRuleError } from "../../shared/errors/index.js";
import { signAccessToken } from "../../utils/jwt.js";
import prisma from "../../lib/prisma.js";

const PIN_LENGTH = 4;

const LOCKOUT_LEVELS = [
  { failAfter: 3, baseSeconds: 60 },
];

export class TableSessionService {

  async resolveRestaurantId(qrToken) {

    const row = await prisma.$queryRaw`
      SELECT t."restaurant_id" FROM "tables" t WHERE t."qr_token" = ${qrToken} LIMIT 1
    `;
    if (!row || !row[0]) throw new NotFoundError("Table not found");
    return row[0].restaurant_id;
  }

  async resolveRestaurantIdForSession(sessionId) {
    const row = await prisma.$queryRaw`
      SELECT s."restaurant_id" FROM "table_sessions" s WHERE s."id" = ${sessionId} LIMIT 1
    `;
    if (!row || !row[0]) throw new NotFoundError("Session not found");
    return row[0].restaurant_id;
  }

  async startSession(tenantContext, tableId) {
    const byToken = await tableSessionRepository.findTableByQrToken(tableId, tenantContext.restaurantId);
    const table =
      byToken ||
      (await prisma.restaurantTable.findFirst({
        where: { id: tableId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      }));
    if (!table || table.restaurantId !== tenantContext.restaurantId) {
      throw new NotFoundError("Table not found in this restaurant");
    }

    const existing = await tableSessionRepository.findActiveSessionByTable(tenantContext.restaurantId, table.id);
    if (existing) {
      throw new BusinessRuleError("This table already has an active session");
    }

    const pin = String(randomInt(0, 10000)).padStart(PIN_LENGTH, "0");
    const pinHash = await bcrypt.hash(pin, 10);
    const session = await tableSessionRepository.createSession(
      tenantContext.restaurantId,
      table.branchId,
      table.id,
      pinHash,
      pin,
      tenantContext.employeeId
    );
    await tableSessionRepository.setTableStatus(table.id, tenantContext.restaurantId, "OCCUPIED");

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: table.branchId,
      sessionId: session.id,
      tableId: table.id,
      action: "started",
    });

    return { sessionId: session.id, pin };
  }

  async joinSession(restaurantId, tableId, { name, pin }) {
    const table = await tableSessionRepository.findTableByQrToken(tableId, restaurantId);
    if (!table) throw new NotFoundError("Table not found");

    const session = await tableSessionRepository.findActiveSessionByTable(restaurantId, table.id);
    if (!session) throw new NotFoundError("No active session for this table. Ask a waiter to start one.");

    const now = Date.now();
    if (session.lockoutUntil && new Date(session.lockoutUntil).getTime() > now) {
      const wait = Math.ceil((new Date(session.lockoutUntil).getTime() - now) / 1000);
      throw new BusinessRuleError(`Too many wrong PIN attempts. Try again in ${wait} seconds`);
    }

    const ok = await bcrypt.compare(pin, session.pinHash);
    if (!ok) {
      const failed = session.failedAttempts + 1;
      const level = LOCKOUT_LEVELS.find((l) => failed >= l.failAfter);
      let lockoutUntil = null;
      let levelIndex = 0;
      if (level) {
        levelIndex = Math.floor(failed / level.failAfter);
        lockoutUntil = new Date(now + level.baseSeconds * Math.pow(2, levelIndex) * 1000);
      }
      await tableSessionRepository.lockout(session.id, restaurantId, failed, levelIndex, lockoutUntil);
      const threshold = LOCKOUT_LEVELS[0].failAfter;
      const remaining = Math.max(0, threshold - failed);
      throw new ValidationError(`Wrong PIN. ${remaining} attempt(s) remaining`);
    }

    await tableSessionRepository.lockout(session.id, restaurantId, 0, 0, null);

    const member = await tableSessionRepository.addMember(restaurantId, session.id, name);
    const memberToken = signAccessToken({
      type: "table-member",
      restaurantId,
      sessionId: session.id,
      memberId: member.id,
    });
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId: session.id,
      tableId: table.id,
      action: "member_joined",
      memberName: name,
    });

    return { ...(await this.publicSession(restaurantId, session.id)), memberToken };
  }

  async addItem(restaurantId, sessionId, memberId, { productId, quantity }) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status !== "ACTIVE") throw new BusinessRuleError("Session is no longer open for adding items");

    const member = await prisma.tableSessionMember.findFirst({
      where: { id: memberId, sessionId },
      select: { name: true },
    });
    const addedByName = member?.name || "عميل";

    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId, isAvailable: true, status: "ACTIVE", deletedAt: null },
    });
    if (!product) throw new NotFoundError("Product not found or unavailable");

    const item = await tableSessionRepository.addItem(restaurantId, sessionId, {
      productId,
      productName: product.name,
      unitPrice: Number(product.price),
      quantity,
      addedByName,
    });
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "item_added",
      itemId: item.id,
      productName: product.name,
      quantity,
      addedByName,
    });
    return this.publicSession(restaurantId, sessionId);
  }

  async updateItem(restaurantId, sessionId, itemId, { quantity }) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const item = (session.items || []).find((i) => i.id === itemId);
    if (!item) throw new NotFoundError("Item not found");
    this.assertItemEditable(session, item);

    await tableSessionRepository.updateItemQuantity(sessionId, itemId, quantity);
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "item_updated",
      itemId,
    });
    return this.publicSession(restaurantId, sessionId);
  }

  async removeItem(restaurantId, sessionId, itemId) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const item = (session.items || []).find((i) => i.id === itemId);
    if (!item) throw new NotFoundError("Item not found");
    this.assertItemEditable(session, item);

    await tableSessionRepository.deleteItem(sessionId, itemId);
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "item_removed",
      itemId,
    });
    return this.publicSession(restaurantId, sessionId);
  }

  assertItemEditable(session, item) {
    if (!item.sessionOrderId) return;
    const order = (session.orders || []).find((o) => o.id === item.sessionOrderId);
    if (order && order.status !== "AWAITING_CONFIRMATION") {
      throw new BusinessRuleError("Cannot modify an item of a confirmed order");
    }
  }

  async callWaiter(restaurantId, sessionId, tableId, { requesterName, note }) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId || tableId,
      action: "call_waiter",
      requesterName,
      note,
    });
    return { ok: true, message: `The waiter has been called${note ? `: ${note}` : ""}` };
  }

  async submitDraft(restaurantId, sessionId) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status !== "ACTIVE") throw new BusinessRuleError("Session is not in an open state");

    const currentItems = (session.items || []).filter((i) => !i.sessionOrderId);
    if (currentItems.length === 0) throw new BusinessRuleError("Cart is empty — add items before submitting");

    const orderNumber = await tableSessionRepository.nextOrderNumber(sessionId);
    const total = currentItems.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
    const order = await tableSessionRepository.createOrder(sessionId, orderNumber, total);
    await tableSessionRepository.linkItemsToOrder(sessionId, order.id);
    await tableSessionRepository.setSessionStatus(restaurantId, sessionId, "AWAITING_CONFIRMATION");

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "submitted",
      orderNumber,
    });
    return this.publicSession(restaurantId, sessionId);
  }

  async confirmSession(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const pendingOrder = await tableSessionRepository.findPendingOrder(sessionId);
    if (!pendingOrder) throw new BusinessRuleError("No order is awaiting confirmation");
    if (pendingOrder.items.length === 0) throw new BusinessRuleError("Cannot confirm an empty order");

    const snapshotItems = [];
    for (const i of pendingOrder.items) {
      const product = await prisma.product.findFirst({
        where: {
          id: i.productId,
          restaurantId: tenantContext.restaurantId,
          isAvailable: true,
          status: "ACTIVE",
          deletedAt: null,
        },
      });
      if (!product) throw new NotFoundError(`Product '${i.productId}' not found or unavailable`);
      const unitPrice = Number(product.price);
      snapshotItems.push({
        productId: product.id,
        productName: product.name,
        quantity: i.quantity,
        unitPrice,
        subtotal: unitPrice * i.quantity,
        notes: null,
        selectedModifiers: null,
        round: pendingOrder.orderNumber,
      });
    }

    const existingOrder = session.confirmedOrderId
      ? await prisma.order.findFirst({
          where: { id: session.confirmedOrderId, restaurantId: tenantContext.restaurantId },
        })
      : null;
    const canAppend =
      existingOrder && ["PENDING", "CONFIRMED", "PREPARING", "READY"].includes(existingOrder.status);

    let realOrderId;
    if (canAppend) {
      const orderRepository = (await import("../orders/order.repository.js")).default;
      realOrderId = await orderRepository.appendItemsToOrder(
        tenantContext,
        session.branchId,
        existingOrder.id,
        snapshotItems
      );
    } else {
      const orderService = (await import("../orders/order.service.js")).default;
      const result = await orderService.createOrder(tenantContext, session.branchId, {
        source: "QR",
        type: "DINE_IN",
        status: "CONFIRMED", // the waiter already confirmed it here — no second confirmation needed
        tableId: session.tableId,
        items: snapshotItems.map((s) => ({ productId: s.productId, quantity: s.quantity })),
      });
      realOrderId = result.data.id;
    }

    const total = pendingOrder.items.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
    await tableSessionRepository.confirmOrder(sessionId, pendingOrder.id, realOrderId, total);
    await tableSessionRepository.setSessionStatus(tenantContext.restaurantId, sessionId, "ACTIVE", {
      confirmedOrderId: realOrderId,
    });

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "confirmed",
      orderId: realOrderId,
      orderNumber: pendingOrder.orderNumber,
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async closeSession(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    await tableSessionRepository.cancelPendingOrders(sessionId);
    const updated = await tableSessionRepository.setSessionStatus(tenantContext.restaurantId, sessionId, "CLOSED");
    await tableSessionRepository.setTableStatus(session.tableId, tenantContext.restaurantId, "AVAILABLE");
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "closed",
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async regeneratePin(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const pin = String(randomInt(0, 10000)).padStart(PIN_LENGTH, "0");
    const pinHash = await bcrypt.hash(pin, 10);
    await tableSessionRepository.updatePin(sessionId, tenantContext.restaurantId, pin, pinHash);

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "pin_regenerated",
    });
    return { sessionId, pin };
  }

  async rejectPendingOrder(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const pendingOrder = await tableSessionRepository.findPendingOrder(sessionId);
    if (!pendingOrder) throw new BusinessRuleError("No order is awaiting confirmation");

    // Returning the order to the customer removes the round entirely — a round only
    // counts as an order once the waiter confirms it. So no "cancelled" order is left.
    await tableSessionRepository.unlinkOrderItems(sessionId, pendingOrder.id);
    await prisma.tableSessionOrder.deleteMany({
      where: { id: pendingOrder.id, sessionId },
    });
    await tableSessionRepository.setSessionStatus(tenantContext.restaurantId, sessionId, "ACTIVE");

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "rejected",
      orderNumber: pendingOrder.orderNumber,
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async getSession(restaurantId, sessionId) {
    return this.publicSession(restaurantId, sessionId);
  }

  async getActiveSessionForTable(tenantContext, tableId) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: tenantContext.restaurantId, deletedAt: null },
    });
    if (!table) throw new NotFoundError("Table not found");
    const session = await tableSessionRepository.findActiveSessionByTable(tenantContext.restaurantId, table.id);
    if (!session) return null;
    return this.publicSession(tenantContext.restaurantId, session.id, { includePin: true });
  }

  async getStaffSession(tenantContext, sessionId) {
    return this.publicSession(tenantContext.restaurantId, sessionId, { includePin: true });
  }

  async listBranchSessions(tenantContext, branchId) {
    const sessions = await tableSessionRepository.findSessionsByBranch(tenantContext.restaurantId, branchId);
    return sessions.map((s) => {
      const currentItems = (s.items || []).filter((i) => !i.sessionOrderId);
      const ordersProjection = (s.orders || []).map((o) => this.orderProjection(o));
      const currentTotal = currentItems.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
      return {
        id: s.id,
        status: s.status,
        tableId: s.tableId,
        tableLabel: s.table?.label || null,
        members: s.members || [],
        itemCount: currentItems.length,
        total: currentTotal,
        grandTotal: currentTotal + ordersProjection
        .filter((o) => o.status === "CONFIRMED")
        .reduce((acc, o) => acc + Number(o.total || 0), 0),
        confirmedOrderId: s.confirmedOrderId,
        orders: ordersProjection,
      };
    });
  }

  orderProjection(order) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total || 0),
      orderId: order.orderId,
      confirmedAt: order.confirmedAt,
      createdAt: order.createdAt,
      items: (order.items || []).map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        unitPrice: Number(i.unitPrice),
        quantity: i.quantity,
        addedByName: i.addedByName,
        total: Number(i.unitPrice) * i.quantity,
      })),
      byMember: this.groupByMember(order.items || []),
    };
  }

  groupByMember(items) {
    const map = new Map();
    for (const item of items) {
      const key = item.addedByName || "عميل";
      if (!map.has(key)) map.set(key, { name: key, items: [], subtotal: 0 });
      const entry = map.get(key);
      const total = Number(item.unitPrice) * item.quantity;
      entry.items.push({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total,
      });
      entry.subtotal += total;
    }
    return Array.from(map.values());
  }

  async publicSession(restaurantId, sessionId, { includePin = false } = {}) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    const currentItems = (session.items || []).filter((i) => !i.sessionOrderId);
    const currentTotal = currentItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    const ordersProjection = (session.orders || []).map((o) => this.orderProjection(o));
    const grandTotal = currentTotal + ordersProjection
      .filter((o) => o.status === "CONFIRMED")
      .reduce((acc, o) => acc + Number(o.total || 0), 0);
    return {
      id: session.id,
      status: session.status,
      tableId: session.tableId,
      tableLabel: session.table?.label || null,
      ...(includePin ? { pin: session.pin || null } : {}),
      members: session.members || [],
      items: currentItems.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        unitPrice: Number(i.unitPrice),
        quantity: i.quantity,
        addedByName: i.addedByName,
        total: Number(i.unitPrice) * i.quantity,
      })),
      total: currentTotal,
      grandTotal,
      orders: ordersProjection,
      confirmedOrderId: session.confirmedOrderId,
    };
  }
}

export const tableSessionService = new TableSessionService();
export default tableSessionService;
