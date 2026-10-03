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

// Wrong-PIN policy: every tier allows PIN_ATTEMPTS_PER_TIER attempts, then locks the
// table for the matching duration and escalates to the next tier (capped at the last).
const PIN_ATTEMPTS_PER_TIER = 5;
const PIN_LOCKOUT_SECONDS = [
  60, // 1 minute
  120, // 2 minutes
  300, // 5 minutes
  600, // 10 minutes
  1800, // 30 minutes
  3600, // 1 hour
  6 * 3600, // 6 hours
  24 * 3600, // 24 hours
  48 * 3600, // 48 hours
];

// Arabic-aware name key so the same guest joining twice is not counted as two
// people: unifies alef/ya/ta-marbuta variants, casing and extra spaces.
function normalizeMemberName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

function formatLockoutDuration(totalSeconds) {
  const seconds = Math.max(1, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} ثانية`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    if (minutes === 1) return "دقيقة";
    if (minutes === 2) return "دقيقتين";
    return `${minutes} دقيقة`;
  }

  const hours = Math.round(seconds / 3600);
  if (hours < 24) {
    if (hours === 1) return "ساعة";
    if (hours === 2) return "ساعتين";
    return `${hours} ساعات`;
  }

  const days = Math.round(seconds / 86400);
  if (days === 1) return "يوم";
  if (days === 2) return "يومين";
  return `${days} أيام`;
}

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
      const activeOrderOnTable = await prisma.order.findFirst({
        where: {
          restaurantId: tenantContext.restaurantId,
          branchId: table.branchId,
          tableId: table.id,
          status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] },
        },
        select: { id: true },
      });
      if (activeOrderOnTable) {
        throw new BusinessRuleError("This table already has an active POS order. Close or deliver it first.");
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
      emitEvent(DomainEvent.TABLE_UPDATED, {
        restaurantId: tenantContext.restaurantId,
        branchId: table.branchId,
        tableId: table.id,
        action: "session_started",
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

  async joinSession(restaurantId, qrToken, { name, pin }) {
    const table = await tableSessionRepository.findTableByQrToken(qrToken, restaurantId);
    if (!table) throw new NotFoundError("Table not found");

    const session = await tableSessionRepository.findActiveSessionByTable(restaurantId, table.id);
    if (!session) throw new BusinessRuleError("مفيش جلسة مفتوحة على الطاولة دي دلوقتي. اطلب من الويتر يفتح الجلسة ويديك رمز الدخول (PIN).");

    const now = Date.now();
    if (session.lockoutUntil && new Date(session.lockoutUntil).getTime() > now) {
      const waitSeconds = Math.ceil((new Date(session.lockoutUntil).getTime() - now) / 1000);
      throw new BusinessRuleError(
        `تم إدخال رمز الدخول غلط عدة مرات. الطاولة مقفولة، جرّب تاني بعد ${formatLockoutDuration(waitSeconds)}.`
      );
    }

    const ok = await bcrypt.compare(pin, session.pinHash);
    if (!ok) {
      const failed = (session.failedAttempts || 0) + 1;
      const currentLevel = Math.min(session.lockoutLevel || 0, PIN_LOCKOUT_SECONDS.length - 1);
      const remaining = PIN_ATTEMPTS_PER_TIER - failed;

      // This tier's attempt quota is used up → lock the table and escalate the tier.
      if (remaining <= 0) {
        const lockoutSeconds = PIN_LOCKOUT_SECONDS[currentLevel];
        const lockoutUntil = new Date(now + lockoutSeconds * 1000);
        const nextLevel = Math.min(currentLevel + 1, PIN_LOCKOUT_SECONDS.length - 1);
        // Reset the per-tier counter so the next tier starts a fresh block of attempts.
        await tableSessionRepository.lockout(session.id, restaurantId, 0, nextLevel, lockoutUntil);
        throw new BusinessRuleError(
          `تم إدخال رمز الدخول غلط ${PIN_ATTEMPTS_PER_TIER} مرات. الطاولة مقفولة لمدة ${formatLockoutDuration(lockoutSeconds)}.`
        );
      }

      await tableSessionRepository.lockout(session.id, restaurantId, failed, currentLevel, null);
      throw new ValidationError(`رمز الدخول غلط. فاضل ${remaining} محاولة.`);
    }

    // Correct PIN → clear the counter and drop back to the lowest tier.
    await tableSessionRepository.lockout(session.id, restaurantId, 0, 0, null);

    const trimmedName = (name || '').trim().replace(/\s+/g, " ");
    const nameKey = normalizeMemberName(trimmedName);
    const existingMembers = await prisma.tableSessionMember.findMany({
      where: { sessionId: session.id },
      select: { id: true, name: true },
    });
    let member = existingMembers.find((m) => normalizeMemberName(m.name) === nameKey) || null;

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
    emitEvent(DomainEvent.TABLE_UPDATED, {
      restaurantId,
      branchId: session.branchId,
      tableId: session.tableId,
      action: "session_confirmed",
    });
    return this.publicSession(restaurantId, sessionId);
  }

  /**
   * Release a table directly from POS without needing a QR session.
   * Marks all active DINE_IN orders as COMPLETED + sets table status → AVAILABLE.
   * Requires only `orders.create` permission (cashier-level).
   */
  async releaseTable(tenantContext, tableId, options = {}) {
    // Verify table belongs to this restaurant
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: tenantContext.restaurantId, deletedAt: null },
    });
    if (!table) throw new NotFoundError("Table not found");

    const paymentMethod = options.paymentMethod || "CASH";
    const now = new Date();

    // Find all active DINE_IN orders for this table (not yet delivered/cancelled)
    const activeOrders = await prisma.order.findMany({
      where: {
        tableId,
        restaurantId: tenantContext.restaurantId,
        type: "DINE_IN",
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    });

    for (const order of activeOrders) {
      // Settle payment if unpaid
      if (order.paymentStatus !== "PAID") {
        const remaining = Math.max(0, Number(order.total) - Number(order.amountPaid || 0));
        if (remaining > 0) {
          await prisma.order.updateMany({
            where: { id: order.id, restaurantId: tenantContext.restaurantId },
            data: {
              amountPaid: Number(order.total),
              paymentStatus: "PAID",
              paymentMethod,
              paidAt: now,
              paidByEmployeeId: tenantContext.employeeId || null,
              version: { increment: 1 },
              updatedAt: now,
            },
          });
          try {
            await prisma.orderPayment.create({
              data: {
                restaurantId: tenantContext.restaurantId,
                orderId: order.id,
                type: "PAYMENT",
                amount: remaining,
                paymentMethod,
                status: "PAID",
                employeeId: tenantContext.employeeId || null,
              },
            });
          } catch (_) {}
        }
        emitEvent(DomainEvent.ORDER_PAID, {
          restaurantId: tenantContext.restaurantId,
          branchId: table.branchId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          total: Number(order.total),
          tableId,
          actorEmployeeId: tenantContext.employeeId || null,
        });
      }
      // Mark order delivered (COMPLETED is not a valid OrderStatus)
      await prisma.order.updateMany({
        where: { id: order.id, restaurantId: tenantContext.restaurantId },
        data: { status: "DELIVERED", version: { increment: 1 }, updatedAt: now },
      });
    }

    // Set table → AVAILABLE using the repo helper (same as closeSession)
    await tableSessionRepository.setTableStatus(tableId, tenantContext.restaurantId, "AVAILABLE");

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: table.branchId,
      tableId,
      action: "released",
    });
    emitEvent(DomainEvent.TABLE_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: table.branchId,
      tableId,
      action: "table_released",
    });

    return { tableId, releasedOrders: activeOrders.length };
  }

  async closeSession(tenantContext, sessionId, options = {}) {

    const session = await tableSessionRepository.findSessionById(tenantContext.restaurantId, sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "CLOSED") throw new BusinessRuleError("Session is closed");

    // Collect all order IDs linked to this session or currently active on this table
    const sessionOrderIds = new Set();
    if (session.confirmedOrderId) sessionOrderIds.add(session.confirmedOrderId);
    if (Array.isArray(session.orders)) {
      for (const o of session.orders) {
        if (o.orderId) sessionOrderIds.add(o.orderId);
      }
    }

    // Find any active DINE_IN orders for this table (not yet delivered/cancelled)
    const activeTableOrders = await prisma.order.findMany({
      where: {
        tableId: session.tableId,
        restaurantId: tenantContext.restaurantId,
        type: "DINE_IN",
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    });
    for (const ato of activeTableOrders) {
      sessionOrderIds.add(ato.id);
    }

    const allOrdersToClose = sessionOrderIds.size > 0
      ? await prisma.order.findMany({
          where: {
            id: { in: Array.from(sessionOrderIds) },
            restaurantId: tenantContext.restaurantId,
            status: { not: "CANCELLED" },
          },
        })
      : [];

    const unpaidOrders = allOrdersToClose.filter((o) => o.paymentStatus === "PENDING");

    if (unpaidOrders.length > 0) {
      if (options?.settlePayment || options?.autoSettle) {
        const method = options.paymentMethod || "CASH";
        const now = new Date();
        for (const uOrder of unpaidOrders) {
          const remaining = Math.max(0, Number(uOrder.total) - Number(uOrder.amountPaid || 0));
          await prisma.order.updateMany({
            where: { id: uOrder.id, restaurantId: tenantContext.restaurantId },
            data: {
              amountPaid: Number(uOrder.total),
              paymentStatus: "PAID",
              paymentMethod: method,
              paidAt: now,
              paidByEmployeeId: tenantContext.employeeId || null,
              status: "DELIVERED",
              version: { increment: 1 },
              updatedAt: now,
            },
          });
          if (remaining > 0) {
            try {
              await prisma.orderPayment.create({
                data: {
                  restaurantId: tenantContext.restaurantId,
                  orderId: uOrder.id,
                  type: "PAYMENT",
                  amount: remaining,
                  paymentMethod: method,
                  status: "PAID",
                  employeeId: tenantContext.employeeId || null,
                },
              });
            } catch (_) {}
          }
          await prisma.orderStatusHistory.create({
            data: {
              restaurantId: tenantContext.restaurantId,
              orderId: uOrder.id,
              fromStatus: uOrder.status,
              toStatus: "DELIVERED",
              changedById: tenantContext.employeeId || null,
              reason: `Payment settled and order delivered on table session close (${method})`,
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

    // Mark remaining paid orders as DELIVERED as well
    const remainingPaidOrders = allOrdersToClose.filter((o) => o.paymentStatus !== "PENDING" && o.status !== "DELIVERED");
    if (remainingPaidOrders.length > 0) {
      const now = new Date();
      for (const pOrder of remainingPaidOrders) {
        await prisma.order.updateMany({
          where: { id: pOrder.id, restaurantId: tenantContext.restaurantId },
          data: {
            status: "DELIVERED",
            version: { increment: 1 },
            updatedAt: now,
          },
        });
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
    emitEvent(DomainEvent.TABLE_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: session.branchId,
      tableId: session.tableId,
      action: "session_closed",
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

  /**
   * Staff-only: reveal the entry PIN of a table's active session on demand, so
   * the waiter can re-read/print it for a guest who forgot it.
   * The PIN stays out of every general session payload.
   */
  async getActiveSessionPin(tenantContext, tableId) {
    const table = await prisma.restaurantTable.findFirst({
      where: {
        id: tableId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      select: { id: true, branchId: true, label: true },
    });
    if (!table) throw new NotFoundError("Table not found");

    const session = await tableSessionRepository.findActiveSessionByTable(
      tenantContext.restaurantId,
      table.id
    );
    if (!session) {
      throw new BusinessRuleError("مفيش جلسة مفتوحة على الطاولة دي دلوقتي.");
    }
    if (!session.pin) {
      throw new BusinessRuleError("مفيش رمز دخول محفوظ للجلسة دي. اعمل توليد رمز جديد.");
    }

    return {
      sessionId: session.id,
      tableId: table.id,
      tableLabel: table.label,
      pin: session.pin,
      failedAttempts: session.failedAttempts || 0,
      lockoutUntil: session.lockoutUntil || null,
      isLocked: Boolean(session.lockoutUntil && new Date(session.lockoutUntil).getTime() > Date.now()),
      attemptsPerTier: PIN_ATTEMPTS_PER_TIER,
    };
  }

  /**
   * Staff-only: clear the wrong-PIN counter and any active lockout for the table's
   * active session, so guests can start a fresh block of attempts.
   */
  async resetPinLockout(tenantContext, tableId) {
    const table = await prisma.restaurantTable.findFirst({
      where: {
        id: tableId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      select: { id: true, branchId: true, label: true },
    });
    if (!table) throw new NotFoundError("Table not found");

    const session = await tableSessionRepository.findActiveSessionByTable(
      tenantContext.restaurantId,
      table.id
    );
    if (!session) {
      throw new BusinessRuleError("مفيش جلسة مفتوحة على الطاولة دي دلوقتي.");
    }

    await tableSessionRepository.lockout(session.id, tenantContext.restaurantId, 0, 0, null);

    emitEvent(DomainEvent.TABLE_SESSION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      branchId: table.branchId,
      sessionId: session.id,
      tableId: table.id,
      action: "pin_lockout_reset",
    });

    return {
      sessionId: session.id,
      tableId: table.id,
      tableLabel: table.label,
      failedAttempts: 0,
      lockoutUntil: null,
      isLocked: false,
    };
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
        qrToken: s.table?.qrToken || null,
        createdAt: s.createdAt,
        openedAt: s.createdAt,
        members: s.members || [],
        itemCount: currentItems.length,
        total: confirmedOrdersTotal,
        confirmedTotal: confirmedOrdersTotal,
        pendingTotal: pendingOrdersTotal,
        draftTotal,
        grandTotal: confirmedOrdersTotal,
        confirmedOrderId: s.confirmedOrderId,
        failedAttempts: s.failedAttempts || 0,
        lockoutUntil: s.lockoutUntil || null,
        isLocked: Boolean(s.lockoutUntil && new Date(s.lockoutUntil).getTime() > Date.now()),
        attemptsPerTier: PIN_ATTEMPTS_PER_TIER,
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
