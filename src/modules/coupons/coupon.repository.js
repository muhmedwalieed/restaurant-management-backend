import prisma from "../../lib/prisma.js";
import { BaseRepository, assertTenantContext, getPaginationOffset } from "../../shared/repositories/base.repository.js";

export class CouponRepository extends BaseRepository {
  async findCoupons(tenantContext, { page = 1, limit = 20, isActive, type, q } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

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
        take,
        include: { branch: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.coupon.count({ where }),
    ]);

    return { items, total };
  }

  async findCouponById(tenantContext, couponId) {
    assertTenantContext(tenantContext);
    return prisma.coupon.findFirst({
      where: { id: couponId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async findCouponByCode(tenantContext, code) {
    assertTenantContext(tenantContext);
    return prisma.coupon.findFirst({
      where: { restaurantId: tenantContext.restaurantId, code, deletedAt: null },
    });
  }

  async createCoupon(tenantContext, data) {
    assertTenantContext(tenantContext);
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
    assertTenantContext(tenantContext);
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
    assertTenantContext(tenantContext);
    const result = await prisma.coupon.updateMany({
      where: { id: couponId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
    });
    return result.count;
  }
}

export const couponRepository = new CouponRepository();
export default couponRepository;
