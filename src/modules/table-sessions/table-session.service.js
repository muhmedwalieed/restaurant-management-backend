import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import tableSessionRepository from "./table-session.repository.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import {
  NotFoundError,
  ValidationError,
  BusinessRuleError,
  ConflictError,
} from "../../shared/errors/index.js";
import { signAccessToken } from "../../utils/jwt.js";
import env from "../../config/env.js";
import prisma from "../../lib/prisma.js";

const PIN_LENGTH = 4;

// Serializes concurrent startSession calls per table so rapid double-clicks
// can't create two active sessions (the unique partial index is the hard guard).
const sessionStartLocks = new Map();

const LOCKOUT_LEVELS = [
  { failAfter: 3, baseSeconds: 60 },
];

const APPENDABLE_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY"];

export class TableSessionService {

  async resolveRestaurantId(qrToken) {
    const candidateRestaurant = await prisma.restaurant.findFirst({
      where: {
        tables: {
          some: {
            qrToken,
            deletedAt: null,
          },
        },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!candidateRestaurant) throw new NotFoundError("Table not found");
    return candidateRestaurant.id;
  }

  async resolveRestaurantIdForSession(sessionId) {
    const candidateRestaurant = await prisma.restaurant.findFirst({
      where: {
        tableSessions: {
          some: { id: sessionId },
        },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!candidateRestaurant) throw new NotFoundError("Session not found");
    return candidateRestaurant.id;
  }

  async startSession(tenantContext, tableId) {
    const lockKey = `${tenantContext.restaurantId}:${tableId}`;
    const inFlight = sessionStartLocks.get(lockKey);
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        /* the first attempt failed — fall through and re-check below */
      }
    }
    const attempt = (async () => {
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

      return { sessionId: session.id, pin, qrToken: table.qrToken, tableId: table.id };
    })();
    sessionStartLocks.set(lockKey, attempt);
    try {
      return await attempt;
    } finally {
      if (sessionStartLocks.get(lockKey) === attempt) sessionStartLocks.delete(lockKey);
    }
  }

  async joinSession(restaurantId, tableId, { name, pin }) {
    const table = await tableSessionRepository.findTableByQrToken(tableId, restaurantId);
    if (!table) throw new NotFoundError("Table not found");

    const session = await tableSessionRepository.findActiveSessionByTable(restaurantId, table.id);
    if (!session) throw new BusinessRuleError("لا توجد جلسة مفتوحة لهذه الطاولة حالياً. يرجى من الويتر فتح الجلسة أولاً وإعطائك رمز الـ PIN.");

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

    const trimmedName = (name || '').trim();
    let member = await prisma.tableSessionMember.findFirst({
      where: {
        sessionId: session.id,
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    });

    if (!member) {
      member = await tableSessionRepository.addMember(restaurantId, session.id, trimmedName);
      emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
        restaurantId,
        branchId: session.branchId,
        sessionId: session.id,
        tableId: table.id,
        action: 'member_joined',
        memberName: trimmedName,
      });
    }

    const memberToken = signAccessToken(
      {
        type: 'table-member',
        restaurantId,
        sessionId: session.id,
        memberId: member.id,
      },
      { expiresIn: env.JWT_TABLE_MEMBER_EXPIRES_IN }
    );

    return { ...(await this.publicSession(restaurantId, session.id)), memberToken };
  }

  async addItem(restaurantId, sessionId, memberId, { productId, quantity }) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");
    if (session.status === "AWAITING_CONFIRMATION") {
      throw new BusinessRuleError("Cannot add items while an order is awaiting confirmation");
    }

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

  async updateItem(restaurantId, sessionId, itemId, { quantity, memberId } = {}) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const item = (session.items || []).find((i) => i.id === itemId);
    if (!item) throw new NotFoundError("Item not found");
    await this.assertItemEditable(session, item, memberId);

    await tableSessionRepository.updateItemQuantity(sessionId, itemId, quantity);

    if (item.sessionOrderId) {
      const remaining = await prisma.tableSessionItem.findMany({
        where: { sessionId, sessionOrderId: item.sessionOrderId },
      });
      const newTotal = remaining.reduce(
        (s, it) => s + (it.id === itemId ? Number(it.unitPrice) * quantity : Number(it.unitPrice) * it.quantity),
        0
      );
      await prisma.tableSessionOrder.updateMany({
        where: { id: item.sessionOrderId, sessionId },
        data: { total: newTotal },
      });
    }

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

  async removeItem(restaurantId, sessionId, itemId, { memberId } = {}) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const item = (session.items || []).find((i) => i.id === itemId);
    if (!item) throw new NotFoundError("Item not found");
    await this.assertItemEditable(session, item, memberId);

    await tableSessionRepository.deleteItem(sessionId, itemId);

    if (item.sessionOrderId) {
      const remaining = await prisma.tableSessionItem.findMany({
        where: { sessionId, sessionOrderId: item.sessionOrderId },
      });
      const newTotal = remaining.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
      await prisma.tableSessionOrder.updateMany({
        where: { id: item.sessionOrderId, sessionId },
        data: { total: newTotal },
      });
    }

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

  async addItemStaff(tenantContext, sessionId, payload) {
    const restaurantId = tenantContext.restaurantId;
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const rawItems = Array.isArray(payload.items) ? payload.items : [payload];
    const items = rawItems.filter((it) => it && (it.productId || it.id));
    if (items.length === 0) throw new ValidationError("No valid items to add");

    const pendingOrder = await tableSessionRepository.findPendingOrder(sessionId);

    for (const it of items) {
      const productId = it.productId || it.id;
      const quantity = Math.max(1, parseInt(it.quantity || it.qty || 1, 10));
      const product = await prisma.product.findFirst({
        where: { id: productId, restaurantId, deletedAt: null },
      });
      if (!product) throw new NotFoundError(`Product ${productId} not found`);

      const unitPrice = Number(product.price);
      await prisma.tableSessionItem.create({
        data: {
          sessionId,
          productId: product.id,
          productName: product.name,
          unitPrice,
          quantity,
          addedByName: tenantContext.name || "الويتر",
          sessionOrderId: pendingOrder ? pendingOrder.id : null,
        },
      });
    }

    if (pendingOrder) {
      const allPendingItems = await prisma.tableSessionItem.findMany({
        where: { sessionId, sessionOrderId: pendingOrder.id },
      });
      const newTotal = allPendingItems.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
      await prisma.tableSessionOrder.updateMany({
        where: { id: pendingOrder.id, sessionId },
        data: { total: newTotal },
      });
    }

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "items_added_staff",
    });

    return this.publicSession(restaurantId, sessionId);
  }

  async assertItemEditable(session, item, memberId = null) {
    if (item.sessionOrderId) {
      const order = (session.orders || []).find((o) => o.id === item.sessionOrderId);
      if (order && order.status !== "AWAITING_CONFIRMATION") {
        throw new BusinessRuleError("Cannot modify an item of a confirmed order");
      }
    }

    if (memberId && item.addedByName) {
      const member = await prisma.tableSessionMember.findFirst({
        where: { id: memberId, sessionId: session.id },
      });
      if (member && member.name && item.addedByName !== member.name) {
        throw new BusinessRuleError(`لا يمكنك تعديل أو حذف هذا الصنف لأنه أُضيف بواسطة «${item.addedByName}»`);
      }
    }
  }

  async callWaiter(restaurantId, sessionId, tableId, { requesterName, note, type, memberId } = {}) {
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const existing = await tableSessionRepository.findActiveWaiterCall(sessionId, restaurantId);
    if (existing) {
      throw new BusinessRuleError("A waiter call is already active for this table");
    }

    let validMemberId = memberId;
    if (validMemberId) {
      const memberExists = await prisma.tableSessionMember.findFirst({
        where: { id: validMemberId, sessionId },
      });
      if (!memberExists) validMemberId = null;
    }
    if (!validMemberId && session.members?.length > 0) {
      validMemberId = session.members[0].id;
    }
    if (!validMemberId) {
      const createdMember = await tableSessionRepository.addMember(
        restaurantId,
        sessionId,
        requesterName || "عميل"
      );
      validMemberId = createdMember.id;
    }

    const callType = ["HELP", "BILL", "CONFIRM_ORDER", "OTHER"].includes(type) ? type : "HELP";
    const name = requesterName || session.members?.find((m) => m.id === validMemberId)?.name || "عميل";
    const finalNote =
      note ||
      (callType === "BILL"
        ? "طلب الفاتورة والحساب"
        : callType === "CONFIRM_ORDER"
        ? "طلب مراجعة وتأكيد الطلب مع الويتر"
        : "طلب مساعدة الويتر");

    const call = await tableSessionRepository.createWaiterCall({
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId || tableId,
      memberId: validMemberId,
      requesterName: name,
      note: finalNote,
      type: callType,
    });

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId || tableId,
      action: "waiter_call",
      callId: call.id,
      requesterName: call.requesterName,
      note: call.note,
      type: callType,
    });
    return {
      ok: true,
      message: callType === "BILL" ? "تم طلب الفاتورة والحساب بنجاح" : `The waiter has been called${finalNote ? `: ${finalNote}` : ""}`,
      call: this.waiterCallProjection(call),
    };
  }

  async acceptWaiterCall(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    const call = await tableSessionRepository.findActiveWaiterCall(sessionId, tenantContext.restaurantId);
    if (!call) throw new NotFoundError("No active waiter call for this session");

    if (call.status === "ACCEPTED") {
      throw new BusinessRuleError("This waiter call is already accepted");
    }

    await tableSessionRepository.acceptWaiterCall(call.id, tenantContext.restaurantId, tenantContext.employeeId);
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "waiter_call_accepted",
      callId: call.id,
      acceptedByEmployeeId: tenantContext.employeeId,
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async dismissWaiterCall(tenantContext, sessionId) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    const call = await tableSessionRepository.findActiveWaiterCall(sessionId, tenantContext.restaurantId);
    if (!call) {
      // Idempotent: If no active call is found, return the session gracefully without 404
      return this.publicSession(tenantContext.restaurantId, sessionId);
    }

    await tableSessionRepository.dismissWaiterCall(call.id, tenantContext.restaurantId);
    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "waiter_call_dismissed",
      callId: call.id,
    });
    return this.publicSession(tenantContext.restaurantId, sessionId);
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
    const restaurantId = tenantContext.restaurantId;
    const session = await tableSessionRepository.findSessionById(restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    const orderRepository = (await import("../orders/order.repository.js")).default;

    let pendingOrderNumber = null;
    let realOrderId = null;

    await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw`
          SELECT id, session_id AS "sessionId", order_number AS "orderNumber", status, total
          FROM table_session_orders
          WHERE session_id = ${sessionId} AND status = 'AWAITING_CONFIRMATION'
          FOR UPDATE
        `;
        const pendingMeta = locked?.[0];
        if (!pendingMeta) throw new BusinessRuleError("No order is awaiting confirmation");

        const pendingOrder = await tx.tableSessionOrder.findFirst({
          where: { id: pendingMeta.id, sessionId },
          include: { items: { orderBy: { createdAt: "asc" } } },
        });
        if (!pendingOrder || pendingOrder.items.length === 0) {
          throw new BusinessRuleError("Cannot confirm an empty order");
        }
        pendingOrderNumber = pendingOrder.orderNumber;

        const productIds = [...new Set(pendingOrder.items.map((i) => i.productId))];
        const products = await tx.product.findMany({
          where: {
            id: { in: productIds },
            restaurantId,
            isAvailable: true,
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        const productById = new Map(products.map((p) => [p.id, p]));

        const snapshotItems = [];
        for (const i of pendingOrder.items) {
          const product = productById.get(i.productId);
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
          ? await tx.order.findFirst({
              where: { id: session.confirmedOrderId, restaurantId },
            })
          : null;

        const canAppend =
          existingOrder &&
          APPENDABLE_ORDER_STATUSES.includes(existingOrder.status) &&
          existingOrder.paymentStatus === "PENDING";

        if (canAppend) {
          realOrderId = await orderRepository.appendItemsToOrder(
            tenantContext,
            session.branchId,
            existingOrder.id,
            snapshotItems,
            tx
          );
        } else {
          const subtotal = snapshotItems.reduce((acc, s) => acc + Number(s.subtotal), 0);
          const created = await orderRepository.createOrderTransaction(
            tenantContext,
            session.branchId,
            {
              source: "QR",
              type: "DINE_IN",
              status: "CONFIRMED",
              tableId: session.tableId,
              subtotal,
              discountAmount: 0,
            },
            snapshotItems,
            null,
            tx
          );
          realOrderId = created.id;
        }

        const total = pendingOrder.items.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
        const confirmedCount = await tableSessionRepository.confirmOrder(
          sessionId,
          pendingOrder.id,
          realOrderId,
          total,
          tx
        );
        if (confirmedCount === 0) {
          throw new ConflictError("Session order was already confirmed by another request");
        }

        await tx.tableSession.updateMany({
          where: { id: sessionId, restaurantId },
          data: {
            status: "ACTIVE",
            confirmedOrderId: realOrderId,
          },
        });
      },
      { timeout: 20000 }
    );

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      sessionId,
      tableId: session.tableId,
      action: "confirmed",
      orderId: realOrderId,
      orderNumber: pendingOrderNumber,
    });
    return this.publicSession(restaurantId, sessionId);
  }

  async closeSession(tenantContext, sessionId, options = {}) {
    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    // Collect all order IDs linked to this session
    const sessionOrderIds = new Set();
    if (session.confirmedOrderId) sessionOrderIds.add(session.confirmedOrderId);
    if (Array.isArray(session.orders)) {
      for (const o of session.orders) {
        if (o.orderId) sessionOrderIds.add(o.orderId);
      }
    }

    if (sessionOrderIds.size > 0) {
      const unpaidOrders = await prisma.order.findMany({
        where: {
          id: { in: Array.from(sessionOrderIds) },
          restaurantId: tenantContext.restaurantId,
          paymentStatus: "PENDING",
          status: { not: "CANCELLED" },
        },
      });

      if (unpaidOrders.length > 0) {
        if (options?.settlePayment || options?.autoSettle) {
          const method = options.paymentMethod || "CASH";
          for (const uOrder of unpaidOrders) {
            await prisma.order.updateMany({
              where: { id: uOrder.id, restaurantId: tenantContext.restaurantId },
              data: {
                paymentStatus: "PAID",
                paymentMethod: method,
                paidAt: new Date(),
                paidByEmployeeId: tenantContext.employeeId || null,
                version: { increment: 1 },
                updatedAt: new Date(),
              },
            });
            await prisma.orderStatusHistory.create({
              data: {
                restaurantId: tenantContext.restaurantId,
                orderId: uOrder.id,
                fromStatus: uOrder.status,
                toStatus: uOrder.status,
                changedById: tenantContext.employeeId || null,
                reason: `Payment settled on table session close (${method})`,
              },
            });
            emitEvent(DomainEvent.ORDER_PAID, {
              restaurantId: tenantContext.restaurantId,
              branchId: session.branchId,
              orderId: uOrder.id,
              orderNumber: uOrder.orderNumber,
              total: Number(uOrder.total),
              tableId: uOrder.tableId || session.tableId,
              actorEmployeeId: tenantContext.employeeId || null,
            });
          }
        } else {
          throw new BusinessRuleError("Cannot close session while linked confirmed order is unpaid");
        }
      }
    }

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

    // Delete the items belonging to this rejected order so it is completely cancelled
    await prisma.tableSessionItem.deleteMany({
      where: { sessionId, sessionOrderId: pendingOrder.id },
    });
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
    return this.publicSession(tenantContext.restaurantId, session.id);
  }

  async getStaffSession(tenantContext, sessionId) {
    return this.publicSession(tenantContext.restaurantId, sessionId);
  }

  async listBranchSessions(tenantContext, branchId) {
    const sessions = await tableSessionRepository.findSessionsByBranch(tenantContext.restaurantId, branchId);
    return sessions.map((s) => {
      const currentItems = (s.items || []).filter((i) => !i.sessionOrderId);
      const ordersProjection = (s.orders || []).map((o) => this.orderProjection(o));
      const confirmedOrdersTotal = ordersProjection
        .filter((o) => o.status === "CONFIRMED")
        .reduce((acc, o) => acc + Number(o.total || 0), 0);
      const pendingOrdersTotal = ordersProjection
        .filter((o) => o.status === "AWAITING_CONFIRMATION")
        .reduce((acc, o) => acc + Number(o.total || 0), 0);
      const draftTotal = currentItems.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);

      return {
        id: s.id,
        status: s.status,
        tableId: s.tableId,
        tableLabel: s.table?.label || null,
        tableNumber: s.table?.label || null,
        pin: s.pin || String(Math.abs((s.id.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0)) % 9000) + 1000),
        qrToken: s.table?.qrToken || null,
        members: s.members || [],
        itemCount: currentItems.length,
        total: confirmedOrdersTotal,
        confirmedTotal: confirmedOrdersTotal,
        pendingTotal: pendingOrdersTotal,
        draftTotal,
        grandTotal: confirmedOrdersTotal,
        confirmedOrderId: s.confirmedOrderId,
        orders: ordersProjection,
        waiterCalls: (s.waiterCalls || []).map((c) => this.waiterCallProjection(c)),
        activeWaiterCall: this.waiterCallProjection((s.waiterCalls || [])[0] || null),
      };
    });
  }

  waiterCallProjection(call) {
    if (!call) return null;
    return {
      id: call.id,
      status: call.status,
      type: call.type,
      requesterName: call.requesterName,
      note: call.note,
      createdAt: call.createdAt,
      acceptedAt: call.acceptedAt,
    };
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

  async publicSession(restaurantId, sessionId) {
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
      tableNumber: session.table?.label || null,
      qrToken: session.table?.qrToken || null,
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
      waiterCall: this.waiterCallProjection((session.waiterCalls || [])[0] || null),
      waiterCalls: (session.waiterCalls || []).map((c) => this.waiterCallProjection(c)),
    };
  }
}

export const tableSessionService = new TableSessionService();
export default tableSessionService;
