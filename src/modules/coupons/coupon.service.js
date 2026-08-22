import couponRepository from "./coupon.repository.js";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../shared/errors/index.js";
import { AuditAction, auditLogService } from "../audit-logs/audit-log.service.js";

/**
 * Validates that a coupon is currently usable (status, window, usage limit, conditions)
 * and computes the server-side discount for the given order.
 *
 * Returns { discountAmount } or throws the appropriate domain error.
 */
function validateCouponRules(coupon, orderSubtotal, items) {
  if (!coupon || coupon.deletedAt) {
    throw new NotFoundError("Coupon not found or access denied");
  }
  if (!coupon.isActive) {
    throw new BusinessRuleError("Coupon is inactive");
  }

  const now = new Date();
  if (coupon.startsAt && now < new Date(coupon.startsAt)) {
    throw new BusinessRuleError("Coupon is not active yet");
  }
  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    throw new BusinessRuleError("Coupon has expired");
  }
  if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) {
    throw new BusinessRuleError("Coupon usage limit has been reached");
  }

  // Product-restricted coupons discount only the eligible line items.
  const applicableIds = Array.isArray(coupon.applicableProductIds) ? coupon.applicableProductIds : [];
  let eligibleSubtotal = Number(orderSubtotal);
  if (applicableIds.length > 0) {
    const applicable = new Set(applicableIds);
    eligibleSubtotal = items.reduce((sum, item) => {
      return applicable.has(item.productId) ? sum + Number(item.subtotal) : sum;
    }, 0);
  }

  if (eligibleSubtotal <= 0) {
    throw new BusinessRuleError("Coupon does not apply to any item in this order");
  }
  if (Number(coupon.minSubtotal) > 0 && eligibleSubtotal < Number(coupon.minSubtotal)) {
    throw new BusinessRuleError(`Minimum subtotal of ${coupon.minSubtotal} is required for this coupon`);
  }

  let discount;
  if (coupon.type === "PERCENTAGE") {
    discount = eligibleSubtotal * (Number(coupon.value) / 100);
    if (coupon.maxDiscount !== null && discount > Number(coupon.maxDiscount)) {
      discount = Number(coupon.maxDiscount);
    }
  } else {
    discount = Math.min(Number(coupon.value), eligibleSubtotal);
  }

  return {
    discountAmount: Number(Math.max(0, discount).toFixed(2)),
    eligibleSubtotal,
  };
}

export class CouponService {
  async listCoupons(tenantContext, filters) {
    const { items, total } = await couponRepository.findCoupons(tenantContext, filters);
    const totalPages = Math.ceil(total / filters.limit) || 1;
    return {
      items,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages },
    };
  }

  async getCouponById(tenantContext, couponId) {
    const coupon = await couponRepository.findCouponById(tenantContext, couponId);
    if (!coupon) {
      throw new NotFoundError("Coupon not found or access denied");
    }
    return coupon;
  }

  async createCoupon(tenantContext, payload) {
    const code = payload.code.toUpperCase();
    const existing = await couponRepository.findCouponByCode(tenantContext, code);
    if (existing) {
      throw new ConflictError(`Coupon code '${code}' already exists in this restaurant`);
    }

    try {
      const coupon = await couponRepository.createCoupon(tenantContext, { ...payload, code });

      await auditLogService.record(tenantContext, {
        actorEmployeeId: tenantContext.employeeId || null,
        action: AuditAction.COUPON_CREATED,
        entityType: "coupon",
        entityId: coupon.id,
        metadata: { code: coupon.code, type: coupon.type, value: Number(coupon.value) },
      });

      return coupon;
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictError(`Coupon code '${code}' already exists in this restaurant`);
      }
      throw error;
    }
  }

  async updateCoupon(tenantContext, couponId, payload) {
    await this.getCouponById(tenantContext, couponId);

    if (payload.code !== undefined) {
      const code = payload.code.toUpperCase();
      const existing = await couponRepository.findCouponByCode(tenantContext, code);
      if (existing && existing.id !== couponId) {
        throw new ConflictError(`Coupon code '${code}' already exists in this restaurant`);
      }
      payload.code = code;
    }

    const count = await couponRepository.updateCoupon(tenantContext, couponId, payload);
    if (count === 0) {
      throw new NotFoundError("Coupon not found or access denied");
    }

    const updated = await this.getCouponById(tenantContext, couponId);

    await auditLogService.record(tenantContext, {
      actorEmployeeId: tenantContext.employeeId || null,
      action: AuditAction.COUPON_UPDATED,
      entityType: "coupon",
      entityId: couponId,
      metadata: { code: updated.code, appliedFields: Object.keys(payload) },
    });

    return updated;
  }

  async deleteCoupon(tenantContext, couponId) {
    const coupon = await this.getCouponById(tenantContext, couponId);
    const count = await couponRepository.softDeleteCoupon(tenantContext, couponId);
    if (count === 0) {
      throw new NotFoundError("Coupon not found or access denied");
    }

    await auditLogService.record(tenantContext, {
      actorEmployeeId: tenantContext.employeeId || null,
      action: AuditAction.COUPON_DELETED,
      entityType: "coupon",
      entityId: couponId,
      metadata: { code: coupon.code },
    });

    return { message: "Coupon deactivated successfully" };
  }

  /**
   * Checkout helper — validates a coupon code and returns the computed discount WITHOUT
   * incrementing usage. Used by the frontend before order submission.
   */
  async validateCoupon(tenantContext, { code, subtotal, items }) {
    const coupon = await couponRepository.findCouponByCode(tenantContext, code.toUpperCase());
    const { discountAmount } = validateCouponRules(coupon, subtotal, items);

    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      minSubtotal: Number(coupon.minSubtotal),
      discountAmount,
    };
  }

  /**
   * Resolves a coupon code to its id (null when missing) for the order engine.
   * Full validity checks happen later under row lock during order creation.
   */
  async getCouponIdByCode(tenantContext, code) {
    const coupon = await couponRepository.findCouponByCode(tenantContext, code.toUpperCase());
    return coupon ? coupon.id : null;
  }

  /**
   * Applies a coupon atomically inside the order-creation transaction.
   *
   * - Locks the coupon row with `SELECT ... FOR UPDATE` (Section 15.2) to serialize the
   *   shared usage-limit counter under concurrent promotional traffic.
   * - Validates usage/expiry/conditions, computes the discount server-side, then
   *   increments `timesUsed` in the same transaction as the order — a failed order
   *   never consumes a usage slot.
   */
  async applyCouponForOrderInTransaction(tx, tenantContext, { couponId, orderSubtotal, items }) {
    const restaurantId = tenantContext.restaurantId;

    const [locked] = await tx.$queryRaw`
      SELECT id FROM "coupons" WHERE id = ${couponId} AND restaurant_id = ${restaurantId} FOR UPDATE
    `;
    if (!locked) {
      throw new NotFoundError("Coupon not found or access denied");
    }

    const coupon = await tx.coupon.findFirst({
      where: { id: couponId, restaurantId },
    });

    const { discountAmount } = validateCouponRules(coupon, orderSubtotal, items);

    await tx.coupon.updateMany({
      where: { id: couponId, restaurantId },
      data: { timesUsed: { increment: 1 }, updatedAt: new Date() },
    });

    return { couponId: coupon.id, code: coupon.code, discountAmount };
  }
}

export const couponService = new CouponService();
export default couponService;