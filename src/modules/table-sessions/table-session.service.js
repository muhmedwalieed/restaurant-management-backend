import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import tableSessionRepository from "./table-session.repository.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import { NotFoundError, ValidationError, BusinessRuleError } from "../../shared/errors/index.js";
import prisma from "../../lib/prisma.js";

const PIN_LENGTH = 4;
// Doubling lockout: attempt fail numbers that trigger a lockout, and the base delay.
const LOCKOUT_LEVELS = [
  { failAfter: 3, baseSeconds: 60 }, // 3 fails -> 60s, then 120s, 240s...
];

export class TableSessionService {
  /** Resolve the restaurantId that owns a QR table token (public helper). */
  async resolveRestaurantId(qrToken) {
    // Safety-net: must scope by a restaurantId; find the owning restaurant first.
    const row = await prisma.$queryRaw`
      SELECT t."restaurant_id" FROM "tables" t WHERE t."qr_token" = ${qrToken} LIMIT 1
    `;
    if (!row || !row[0]) throw new NotFoundError("Table not found");
    return row[0].restaurant_id;
  }

  /** Resolve the restaurantId that owns a session (public helpers). */
  async resolveRestaurantIdForSession(sessionId) {
    const row = await prisma.$queryRaw`
      SELECT s."restaurant_id" FROM "table_sessions" s WHERE s."id" = ${sessionId} LIMIT 1
    `;
    if (!row || !row[0]) throw new NotFoundError("Session not found");
    return row[0].restaurant_id;
  }
  /**
   * Employee starts a session on a table and gets a 4-digit PIN.
   * `tableId` may be the table id or its QR token.
   */
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

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: table.branchId,
      sessionId: session.id,
      tableId: table.id,
      action: "started",
    });

    return { sessionId: session.id, pin };
  }

  /**
   * Customer joins with name + PIN. Applies doubling lockout on failures.
   */
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
      await tableSessionRepository.lockout(session.id, failed, levelIndex, lockoutUntil);
      const threshold = LOCKOUT_LEVELS[0].failAfter;
      const remaining = Math.max(0, threshold - failed);
      throw new ValidationError(`Wrong PIN. ${remaining} attempt(s) remaining`);
    }

    // reset failures on success
    await tableSessionRepository.lockout(session.id, 0, 0, null);

    const member = await tableSessionRepository.addMember(restaurantId, session.id, name);
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId: session.id,
      tableId: table.id,
      action: "member_joined",
      memberName: name,
    });

    return this.publicSession(restaurantId, session.id, member.id);
  }

  /**
   * Customer adds an item to the shared cart (draft — not a real order).
   */
  async addItem(restaurantId, sessionId, { productId, quantity, addedByName }) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status !== "ACTIVE") throw new BusinessRuleError("Session is no longer open for adding items");

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

    await tableSessionRepository.updateItemQuantity(restaurantId, sessionId, itemId, quantity);
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

    await tableSessionRepository.deleteItem(restaurantId, sessionId, itemId);
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

  /** Items can only be edited while they belong to the current cart or the pending (unconfirmed) order. */
  assertItemEditable(session, item) {
    if (!item.sessionOrderId) return; // part of the current cart
    const order = (session.orders || []).find((o) => o.id === item.sessionOrderId);
    if (order && order.status !== "AWAITING_CONFIRMATION") {
      throw new BusinessRuleError("Cannot modify an item of a confirmed order");
    }
  }

  /**
   * Customer calls the waiter to the table.
   */
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

  /**
   * Customer submits the current cart as a new order round for the waiter to review.
   * The session stays open so customers can keep ordering later (multiple orders per session).
   */
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

  /**
   * Waiter reviews/edits the pending order and confirms -> becomes a real order.
   * The session returns to ACTIVE so customers can place another round of orders.
   */
  async confirmSession(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const pendingOrder = await tableSessionRepository.findPendingOrder(sessionId);
    if (!pendingOrder) throw new BusinessRuleError("No order is awaiting confirmation");
    if (pendingOrder.items.length === 0) throw new BusinessRuleError("Cannot confirm an empty order");

    // Create a real order via the order service (source QR, DINE_IN).
    const orderService = (await import("../orders/order.service.js")).default;
    const result = await orderService.createOrder(tenantContext, session.branchId, {
      source: "QR",
      type: "DINE_IN",
      tableId: session.tableId,
      items: pendingOrder.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    });

    const total = pendingOrder.items.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
    await tableSessionRepository.confirmOrder(sessionId, pendingOrder.id, result.data.id, total);
    await tableSessionRepository.setSessionStatus(tenantContext.restaurantId, sessionId, "ACTIVE", {
      confirmedOrderId: result.data.id,
    });

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "confirmed",
      orderId: result.data.id,
      orderNumber: pendingOrder.orderNumber,
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async closeSession(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    await tableSessionRepository.cancelPendingOrders(sessionId);
    const updated = await tableSessionRepository.setSessionStatus(tenantContext.restaurantId, sessionId, "CLOSED");
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "closed",
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async getSession(restaurantId, sessionId) {
    return this.publicSession(restaurantId, sessionId);
  }

  /** Staff: find the active session for a specific table (or null). */
  async getActiveSessionForTable(tenantContext, tableId) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: tenantContext.restaurantId, deletedAt: null },
    });
    if (!table) throw new NotFoundError("Table not found");
    const session = await tableSessionRepository.findActiveSessionByTable(tenantContext.restaurantId, table.id);
    if (!session) return null;
    return this.publicSession(tenantContext.restaurantId, session.id, { includePin: true });
  }

  /** Staff: get a session including the plaintext PIN (never exposed on public endpoints). */
  async getStaffSession(tenantContext, sessionId) {
    return this.publicSession(tenantContext.restaurantId, sessionId, { includePin: true });
  }

  /** Staff: list live sessions for a branch (active / awaiting confirmation). */
  async listBranchSessions(tenantContext, branchId) {
    const sessions = await tableSessionRepository.findSessionsByBranch(tenantContext.restaurantId, branchId);
    return sessions.map((s) => {
      const currentItems = (s.items || []).filter((i) => !i.sessionOrderId);
      return {
        id: s.id,
        status: s.status,
        tableId: s.tableId,
        tableLabel: s.table?.label || null,
        members: s.members || [],
        itemCount: currentItems.length,
        total: currentItems.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0),
        confirmedOrderId: s.confirmedOrderId,
        orders: (s.orders || []).map((o) => this.orderProjection(o)),
      };
    });
  }

  /** Shape a single order round for the public/staff projections. */
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

  /** Group order items by who added them (per-person bill breakdown). */
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

  /** Public (customer-safe) projection of a session. PIN is only included for staff callers. */
  async publicSession(restaurantId, sessionId, { includePin = false } = {}) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    const currentItems = (session.items || []).filter((i) => !i.sessionOrderId);
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
      total: currentItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0),
      orders: (session.orders || []).map((o) => this.orderProjection(o)),
      confirmedOrderId: session.confirmedOrderId,
    };
  }
}

export const tableSessionService = new TableSessionService();
export default tableSessionService;