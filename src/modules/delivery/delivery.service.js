import deliveryRepository from "./delivery.repository.js";
import { NotFoundError, BusinessRuleError, ConflictError } from "../../shared/errors/index.js";
import { assertBranchInTenant } from "../../shared/utils/assert-branch.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import { getEmployeePermissions } from "../auth/authorize.middleware.js";
import prisma from "../../lib/prisma.js";

export class DeliveryService {
  async verifyBranchOwnership(tenantContext, branchId) {
    return assertBranchInTenant(tenantContext, branchId);
  }

  /**
   * Get delivery orders for driver / branch.
   */
  async getDeliveryOrders(tenantContext, branchId, { status } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const orders = await deliveryRepository.findDeliveryOrders(tenantContext, branchId, { status });

    return orders.map((o) => {
      const isCod = o.paymentStatus === "PENDING" || o.paymentMethod === "CASH";
      const isAccepted = o.status === "OUT_FOR_DELIVERY" || o.status === "DELIVERED";

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        type: o.type,
        source: o.source,
        status: o.status,
        deliveryStatus: o.deliveryStatus,
        driverEmployeeId: o.driverEmployeeId,
        driver: o.driver
          ? {
              id: o.driver.id,
              name: o.driver.name,
              phone: o.driver.phone,
            }
          : null,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        isCod,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount || 0),
        total: Number(o.total),
        notes: o.notes,
        address: o.address,
        cancelReason: o.cancelReason,
        version: o.version,
        createdAt: o.createdAt,
        // Data Privacy: Customer PII (Name & Phone) is strictly hidden from drivers until handover is approved
        customer: (isAccepted && o.customer)
          ? {
              id: o.customer.id,
              name: o.customer.name,
              phone: o.customer.phone,
            }
          : null,
        items: o.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          subtotal: Number(it.subtotal),
          notes: it.notes,
        })),
      };
    });
  }

  /**
   * Driver requests pickup from restaurant (requires Cashier approval).
   */
  async requestPickupOrder(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.type !== "DELIVERY") {
      throw new BusinessRuleError("Only delivery orders can be picked up by delivery drivers");
    }

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new BusinessRuleError(`لا يمكن طلب استلام أوردر بحالة ${order.status}`);
    }

    if (order.status === "OUT_FOR_DELIVERY") {
      throw new BusinessRuleError("هذا الطلب خرج بالفعل مع مندوب التوصيل");
    }

    if (order.deliveryStatus === "PENDING_HANDOVER" && order.driverEmployeeId === tenantContext.employeeId) {
      throw new BusinessRuleError("تم إرسال طلب استلام هذا الأوردر مسبقاً، وهو بانتظار موافقة وتسليم الكاشير");
    }

    if (order.deliveryStatus === "PENDING_HANDOVER" && order.driverEmployeeId && order.driverEmployeeId !== tenantContext.employeeId) {
      throw new ConflictError("هذا الطلب بانتظار تسليمه لمندوب توصيل آخر حالياً");
    }

    const driverEmployeeId = tenantContext.employeeId;
    if (!driverEmployeeId) throw new BusinessRuleError("Driver employee ID is required");

    // Anti-spam cooldown (15 seconds) per driver per order
    const recentActivity = await prisma.orderStatusHistory.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        changedById: driverEmployeeId,
        createdAt: {
          gte: new Date(Date.now() - 15000),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentActivity) {
      const elapsedMs = Date.now() - new Date(recentActivity.createdAt).getTime();
      const remainingSec = Math.max(1, Math.ceil((15000 - elapsedMs) / 1000));
      throw new BusinessRuleError(`يرجى الانتظار ${remainingSec} ثوانٍ قبل إعادة تقديم طلب استلام الأوردر`);
    }

    await deliveryRepository.requestPickup(tenantContext, branchId, orderId, driverEmployeeId);

    const driver = await prisma.employee.findFirst({
      where: {
        id: driverEmployeeId,
        restaurantId: tenantContext.restaurantId,
      },
      select: { id: true, name: true, phone: true },
    });

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: driverEmployeeId,
        reason: `طلب استلام الطلب من قبل المندوب: ${driver?.name || 'مندوب التوصيل'} - بانتظار موافقة الكاشير`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: driverEmployeeId,
      deliveryStatus: "PENDING_HANDOVER",
      driver,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      deliveryStatus: "PENDING_HANDOVER",
      message: `تم إرسال طلب استلام الطلب #${order.orderNumber}، بانتظار موافقة الكاشير وتسليم الأوردر`,
    };
  }

  /**
   * Cashier approves handover to driver (marks order as OUT_FOR_DELIVERY).
   */
  async approvePickupOrder(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    const driverId = order.driverEmployeeId;
    if (!driverId) {
      throw new BusinessRuleError("لا يوجد مندوب توصيل مسجل لطلب هذا الأوردر");
    }

    const fromStatus = order.status;
    const toStatus = "OUT_FOR_DELIVERY";

    await deliveryRepository.approvePickup(tenantContext, branchId, orderId, driverId);

    const driver = await prisma.employee.findFirst({
      where: {
        id: driverId,
        restaurantId: tenantContext.restaurantId,
      },
      select: { id: true, name: true, phone: true },
    });

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: `تمت الموافقة وتسليم الطلب للمندوب: ${driver?.name || 'مندوب التوصيل'} من قبل الكاشير`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
      driver,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      deliveryStatus: "OUT_FOR_DELIVERY",
      driver,
      message: `تمت الموافقة وتسليم الطلب #${order.orderNumber} للمندوب ${driver?.name || ''} بنجاح`,
    };
  }

  /**
   * Cashier rejects handover to driver.
   */
  async rejectPickupOrder(tenantContext, branchId, orderId, { reason } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    const rejectReason = reason || "تم رفض تسليم الطلب من قبل الكاشير";
    await deliveryRepository.rejectPickup(tenantContext, branchId, orderId, rejectReason);

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: tenantContext.employeeId || null,
        reason: `تم رفض تسليم الطلب للمندوب (${rejectReason})`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
      deliveryStatus: "REJECTED",
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      deliveryStatus: "REJECTED",
      message: `تم رفض تسليم الطلب #${order.orderNumber}`,
    };
  }

  /**
   * Driver cancels own pickup request.
   */
  async cancelPickupOrder(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const driverEmployeeId = tenantContext.employeeId;
    if (!driverEmployeeId) throw new BusinessRuleError("Driver employee ID is required");

    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    await deliveryRepository.cancelPickup(tenantContext, branchId, orderId, driverEmployeeId);

    // Record cancellation in history to enforce anti-spam cooldown and audit trail
    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: driverEmployeeId,
        reason: "إلغاء طلب الاستلام من قبل المندوب",
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: driverEmployeeId,
      deliveryStatus: "CANCELLED_BY_DRIVER",
    });

    return {
      orderId,
      message: "تم إلغاء طلب الاستلام بنجاح",
    };
  }

  /**
   * Cashier assigns delivery order to a driver (Driver must Accept / Reject).
   */
  async assignDriverOrder(tenantContext, branchId, orderId, driverEmployeeId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.type !== "DELIVERY") {
      throw new BusinessRuleError("لا يمكن إسناد طلبات غير مخصصة للتوصيل (DELIVERY)");
    }

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new BusinessRuleError(`لا يمكن إسناد طلب بحالة ${order.status}`);
    }

    if (order.status === "OUT_FOR_DELIVERY") {
      throw new BusinessRuleError("هذا الطلب خرج بالفعل للتوصيل مع مندوب آخر");
    }

    const driver = await prisma.employee.findFirst({
      where: {
        id: driverEmployeeId,
        restaurantId: tenantContext.restaurantId,
      },
      select: { id: true, name: true, phone: true },
    });

    if (!driver) {
      throw new NotFoundError("مندوب التوصيل غير موجود أو ليس لديه صلاحية في هذا الفرع");
    }

    await deliveryRepository.assignDriverToOrder(tenantContext, branchId, orderId, driverEmployeeId);

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: tenantContext.employeeId || null,
        reason: `طلب إسناد وتوصيل الأوردر من الكاشير إلى المندوب: ${driver.name} - بانتظار قبول المندوب`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
      deliveryStatus: "PENDING_DRIVER_ACCEPTANCE",
      driver,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      deliveryStatus: "PENDING_DRIVER_ACCEPTANCE",
      driver,
      message: `تم إرسال طلب استلام الأوردر #${order.orderNumber} للمندوب ${driver.name}، بانتظار موافقته`,
    };
  }

  /**
   * Driver accepts assignment from Cashier.
   */
  async acceptDriverAssignment(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    const driverEmployeeId = tenantContext.employeeId;
    if (!driverEmployeeId) throw new BusinessRuleError("Driver employee ID is required");

    if (order.driverEmployeeId !== driverEmployeeId) {
      throw new BusinessRuleError("هذا الأوردر غير موجه إليك");
    }

    if (order.deliveryStatus !== "PENDING_DRIVER_ACCEPTANCE") {
      throw new BusinessRuleError("هذا الطلب لم يعد بانتظار موافقتك");
    }

    await deliveryRepository.acceptDriverAssignment(tenantContext, branchId, orderId, driverEmployeeId);

    const driver = await prisma.employee.findFirst({
      where: {
        id: driverEmployeeId,
        restaurantId: tenantContext.restaurantId,
      },
      select: { id: true, name: true, phone: true },
    });

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: "OUT_FOR_DELIVERY",
        changedById: driverEmployeeId,
        reason: `تم قبول واستلام الأوردر من قبل المندوب: ${driver?.name || "مندوب التوصيل"}`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: "OUT_FOR_DELIVERY",
      orderNumber: order.orderNumber,
      actorEmployeeId: driverEmployeeId,
      deliveryStatus: "OUT_FOR_DELIVERY",
      driver,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: "OUT_FOR_DELIVERY",
      deliveryStatus: "OUT_FOR_DELIVERY",
      message: `تم قبول واستلام الأوردر #${order.orderNumber} بنجاح، وهو الآن قيد التوصيل معك 🛵`,
    };
  }

  /**
   * Driver rejects assignment from Cashier.
   */
  async rejectDriverAssignment(tenantContext, branchId, orderId, { reason } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    const driverEmployeeId = tenantContext.employeeId;
    if (!driverEmployeeId) throw new BusinessRuleError("Driver employee ID is required");

    if (order.driverEmployeeId !== driverEmployeeId) {
      throw new BusinessRuleError("هذا الأوردر غير موجه إليك");
    }

    const rejectReason = reason || "تم رفض استلام الأوردر من قبل المندوب";
    await deliveryRepository.rejectDriverAssignment(tenantContext, branchId, orderId, driverEmployeeId, rejectReason);

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: driverEmployeeId,
        reason: `رفض المندوب استلام الأوردر (${rejectReason})`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: driverEmployeeId,
      deliveryStatus: "DRIVER_REJECTED",
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      message: `تم رفض استلام طلب #${order.orderNumber}`,
    };
  }

  /**
   * Cashier cancels driver assignment request before driver accepts.
   */
  async cancelDriverAssignment(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    await deliveryRepository.cancelDriverAssignment(tenantContext, branchId, orderId);

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: tenantContext.employeeId || null,
        reason: "إلغاء طلب إسناد الأوردر للمندوب من قبل الكاشير",
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
      deliveryStatus: null,
    });

    return {
      orderId,
      message: "تم إلغاء إسناد الأوردر للمندوب",
    };
  }

  /**
   * Get all orders pending handover in the branch (for Cashier real-time modal / alert).
   */
  async getPendingHandovers(tenantContext, branchId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const orders = await deliveryRepository.findPendingHandovers(tenantContext, branchId);
    return orders.map((o) => {
      const isCod = o.paymentStatus === "PENDING" || o.paymentMethod === "CASH";
      const isReturn = o.status === "CANCELLED" || o.deliveryStatus === "FAILED_DELIVERY" || o.deliveryStatus === "RETURNED_TO_CASHIER";
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        type: o.type,
        status: o.status,
        deliveryStatus: o.deliveryStatus,
        driverRequestedAt: o.driverRequestedAt,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        isCod,
        isReturn,
        cancelReason: o.cancelReason,
        driverNotes: o.driverNotes,
        total: Number(o.total),
        address: o.address,
        notes: o.notes,
        customer: o.customer,
        driver: o.driver,
        items: o.items.map((it) => ({
          id: it.id,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          subtotal: Number(it.subtotal),
          notes: it.notes,
        })),
      };
    });
  }

  /**
   * Driver marks returned order handed over to cashier.
   */
  async handoverReturnOrder(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.driverEmployeeId && tenantContext.employeeId && order.driverEmployeeId !== tenantContext.employeeId) {
      const { roleName, isSystem, permissions } = await getEmployeePermissions(
        tenantContext.employeeId,
        tenantContext.restaurantId
      );
      const canOverride =
        (isSystem && roleName === "owner") ||
        permissions.includes("delivery.settle") ||
        permissions.includes("orders.source_cashier") ||
        permissions.includes("orders.update");

      if (!canOverride) {
        throw new BusinessRuleError("هذا الطلب مسند لمندوب توصيل آخر");
      }
    }

    const driverEmployeeId = tenantContext.employeeId || order.driverEmployeeId || null;

    await deliveryRepository.handoverReturnOrder(tenantContext, branchId, orderId, driverEmployeeId);

    const driver = driverEmployeeId
      ? await prisma.employee.findFirst({
          where: {
            id: driverEmployeeId,
            restaurantId: tenantContext.restaurantId,
          },
          select: { id: true, name: true, phone: true },
        })
      : null;

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: driverEmployeeId,
        reason: `قام المندوب ${driver?.name || "مندوب التوصيل"} بتسليم الأوردر المرتجع للمطعم بانتظار استلام الكاشير`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: driverEmployeeId,
      deliveryStatus: "RETURNED_TO_CASHIER",
      driver,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      deliveryStatus: "RETURNED_TO_CASHIER",
      message: `تم إرسال إشعار للكاشير لتأكيد استلام الأوردر المرتجع #${order.orderNumber}`,
    };
  }

  /**
   * Cashier confirms receipt of returned order from driver.
   */
  async confirmReturnOrder(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    await deliveryRepository.confirmReturnOrder(tenantContext, branchId, orderId);

    const driver = order.driverEmployeeId
      ? await prisma.employee.findFirst({
          where: {
            id: order.driverEmployeeId,
            restaurantId: tenantContext.restaurantId,
          },
          select: { id: true, name: true, phone: true },
        })
      : null;

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: tenantContext.employeeId || null,
        reason: `تم استلام وتأكيد استلام المرتجع من المندوب: ${driver?.name || "مندوب التوصيل"} في المطعم`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
      deliveryStatus: "RETURN_CONFIRMED",
      driver,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      deliveryStatus: "RETURN_CONFIRMED",
      message: `تم تأكيد استلام الأوردر المرتجع #${order.orderNumber} من المندوب ${driver?.name || ""} بنجاح`,
    };
  }

  /**
   * Driver marks order as Picked Up / Out for Delivery directly (fallback).
   */
  async pickupOrder(tenantContext, branchId, orderId, { expectedVersion } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.type !== "DELIVERY") {
      throw new BusinessRuleError("Only delivery orders can be picked up by delivery drivers");
    }

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new BusinessRuleError(`Order is already ${order.status}`);
    }

    const fromStatus = order.status;
    const toStatus = "OUT_FOR_DELIVERY";

    const updated = await deliveryRepository.updateDeliveryStatus(tenantContext, orderId, {
      status: toStatus,
      expectedVersion,
    });

    if (updated.count === 0) {
      throw new ConflictError("Order was updated by another request. Please refresh and try again.");
    }

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: "Picked up from restaurant by delivery driver",
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      message: `تم استلام الطلب #${order.orderNumber} وبدء التوصيل`,
    };
  }

  /**
   * Driver marks order as Delivered and settles COD if cash.
   */
  async deliverOrder(tenantContext, branchId, orderId, { expectedVersion, paymentMethod = "CASH" } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.type !== "DELIVERY") {
      throw new BusinessRuleError("Only delivery orders can be delivered");
    }

    if (order.status === "DELIVERED") {
      throw new BusinessRuleError("Order is already delivered");
    }

    // Enforce driver ownership: only assigned driver or cashier/admin can confirm delivery
    if (order.driverEmployeeId && tenantContext.employeeId && order.driverEmployeeId !== tenantContext.employeeId) {
      const { roleName, isSystem, permissions } = await getEmployeePermissions(
        tenantContext.employeeId,
        tenantContext.restaurantId
      );
      const canOverride =
        (isSystem && roleName === "owner") ||
        permissions.includes("delivery.settle") ||
        permissions.includes("orders.source_cashier") ||
        permissions.includes("orders.update");

      if (!canOverride) {
        throw new BusinessRuleError("هذا الطلب مسند لمندوب توصيل آخر ولا يمكنك تأكيد تسليمه");
      }
    }

    const fromStatus = order.status;
    const toStatus = "DELIVERED";
    const isCod = order.paymentStatus === "PENDING";
    const now = new Date();

    const updatePayload = {
      status: toStatus,
      expectedVersion,
    };

    if (isCod) {
      updatePayload.paymentStatus = "PAID";
      updatePayload.paymentMethod = paymentMethod || "CASH";
      updatePayload.amountPaid = Number(order.total);
    }

    const updated = await deliveryRepository.updateDeliveryStatus(tenantContext, orderId, updatePayload);
    if (updated.count === 0) {
      throw new ConflictError("Order was updated by another request. Please refresh and try again.");
    }

    if (isCod) {
      try {
        await prisma.orderPayment.create({
          data: {
            restaurantId: tenantContext.restaurantId,
            orderId,
            type: "PAYMENT",
            amount: Number(order.total),
            paymentMethod: paymentMethod || "CASH",
            status: "PAID",
            employeeId: tenantContext.employeeId || null,
          },
        });
      } catch (_) {}

      emitEvent(DomainEvent.ORDER_PAID, {
        restaurantId: tenantContext.restaurantId,
        branchId,
        orderId,
        orderNumber: order.orderNumber,
        total: Number(order.total),
        paymentMethod: paymentMethod || "CASH",
        actorEmployeeId: tenantContext.employeeId || null,
      });
    }

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: isCod
          ? `Delivered to customer - COD cash (${order.total}) collected by driver`
          : "Delivered to customer (Prepaid online)",
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      isCod,
      collectedAmount: isCod ? Number(order.total) : 0,
      message: `تم تأكيد تسليم الطلب #${order.orderNumber} بنجاح`,
    };
  }

  /**
   * Driver marks delivery as Failed / Returned.
   */
  async failDelivery(tenantContext, branchId, orderId, { expectedVersion, reason } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.status === "DELIVERED") {
      throw new BusinessRuleError("Cannot fail an already delivered order");
    }

    // Enforce driver ownership: only assigned driver or cashier/admin can mark delivery failed
    if (order.driverEmployeeId && tenantContext.employeeId && order.driverEmployeeId !== tenantContext.employeeId) {
      const { roleName, isSystem, permissions } = await getEmployeePermissions(
        tenantContext.employeeId,
        tenantContext.restaurantId
      );
      const canOverride =
        (isSystem && roleName === "owner") ||
        permissions.includes("delivery.settle") ||
        permissions.includes("orders.source_cashier") ||
        permissions.includes("orders.update");

      if (!canOverride) {
        throw new BusinessRuleError("هذا الطلب مسند لمندوب توصيل آخر");
      }
    }

    const fromStatus = order.status;
    const toStatus = "CANCELLED";
    const cancelReason = reason || "تعذر الوصول إلى العميل";

    const updated = await deliveryRepository.updateDeliveryStatus(tenantContext, orderId, {
      status: toStatus,
      deliveryStatus: "FAILED_DELIVERY",
      cancelReason,
      expectedVersion,
    });

    if (updated.count === 0) {
      throw new ConflictError("Order was updated by another request. Please refresh and try again.");
    }

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: `تعذر تسليم الطلب (مرتجع للمطعم): ${cancelReason}`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
      deliveryStatus: "FAILED_DELIVERY",
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      cancelReason,
      message: `تم تسجيل تعذر تسليم الطلب #${order.orderNumber}`,
    };
  }

  /**
   * Get driver's cash wallet reconciliation.
   */
  async getDriverWallet(tenantContext, branchId, driverId = null) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    
    let targetDriverId = tenantContext.employeeId;
    if (driverId && driverId !== tenantContext.employeeId) {
      const { roleName, isSystem, permissions } = await getEmployeePermissions(
        tenantContext.employeeId,
        tenantContext.restaurantId
      );
      const canViewOthers =
        (isSystem && roleName === "owner") ||
        permissions.includes("delivery.settle") ||
        permissions.includes("dashboard.view") ||
        permissions.includes("orders.source_cashier");

      if (canViewOthers) {
        targetDriverId = driverId;
      } else {
        targetDriverId = tenantContext.employeeId;
      }
    }

    if (!targetDriverId) throw new BusinessRuleError("Driver employee ID is required");

    return deliveryRepository.calculateDriverWallet(tenantContext, branchId, targetDriverId);
  }

  /**
   * Cashier settles COD cash with delivery driver.
   */
  async settleDriverCash(tenantContext, branchId, { driverEmployeeId, amount, notes }) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    if (!driverEmployeeId) throw new BusinessRuleError("Driver ID is required");
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new BusinessRuleError("Valid settlement amount is required");
    }

    const record = await deliveryRepository.recordDriverSettlement(tenantContext, branchId, driverEmployeeId, {
      amount: numAmount,
      notes,
      settledByEmployeeId: tenantContext.employeeId || null,
    });

    const updatedWallet = await deliveryRepository.calculateDriverWallet(tenantContext, branchId, driverEmployeeId);

    return {
      settlementId: record.id,
      settledAmount: numAmount,
      remainingToSettle: updatedWallet.remainingToSettle,
      message: `تم استلام وتصفية عهدة الطيار بمبلغ ${numAmount.toFixed(2)} بنجاح`,
    };
  }

  /**
   * Cashier views all branch drivers with active wallets.
   */
  async getBranchDrivers(tenantContext, branchId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const drivers = await deliveryRepository.findBranchDrivers(tenantContext, branchId);

    const results = [];
    for (const d of drivers) {
      const wallet = await deliveryRepository.calculateDriverWallet(tenantContext, branchId, d.id);
      results.push({
        ...d,
        wallet,
      });
    }

    return results;
  }
}

export const deliveryService = new DeliveryService();
export default deliveryService;
