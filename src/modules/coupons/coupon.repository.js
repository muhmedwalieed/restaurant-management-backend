import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class CouponRepository {

  async findCoupons(tenantContext, { page = 1, limit = 20, isActive, type, q } = {}) {
    this.assertTenant(tenantContext);
    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(type ? { type } : {}),
      ...(q ? { code: { contains: q, mode: "insensitive" } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        include: { branch: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.coupon.count({ where }),
    ]);

    return { items, total };
  }

  async findCouponById(tenantContext, couponId) {
    this.assertTenant(tenantContext);
    return prisma.coupon.findFirst({
      where: { id: couponId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async findCouponByCode(tenantContext, code) {
    this.assertTenant(tenantContext);
    return prisma.coupon.findFirst({
      where: { restaurantId: tenantContext.restaurantId, code, deletedAt: null },
    });
  }

  async createCoupon(tenantContext, data) {
    this.assertTenant(tenantContext);
    return prisma.coupon.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId: data.branchId || null,
        code: data.code,
        type: data.type,
        value: data.value,
        minSubtotal: data.minSubtotal || 0,
        maxDiscount: data.maxDiscount ?? null,
        applicableProductIds: data.applicableProductIds && data.applicableProductIds.length ? data.applicableProductIds : null,
        usageLimit: data.usageLimit ?? null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async updateCoupon(tenantContext, couponId, data) {
    this.assertTenant(tenantContext);
    const result = await prisma.coupon.updateMany({
      where: { id: couponId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      data: {
        ...(data.branchId !== undefined ? { branchId: data.branchId || null } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.minSubtotal !== undefined ? { minSubtotal: data.minSubtotal } : {}),
        ...(data.maxDiscount !== undefined ? { maxDiscount: data.maxDiscount ?? null } : {}),
        ...(data.applicableProductIds !== undefined
          ? { applicableProductIds: data.applicableProductIds && data.applicableProductIds.length ? data.applicableProductIds : null }
          : {}),
        ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit ?? null } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: new Date(),
      },
    });
    return result.count;
  }

  async softDeleteCoupon(tenantContext, couponId) {
    this.assertTenant(tenantContext);
    const result = await prisma.coupon.updateMany({
      where: { id: couponId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
    });
    return result.count;
  }

  assertTenant(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }
  }
}

export const couponRepository = new CouponRepository();
export default couponRepository;
