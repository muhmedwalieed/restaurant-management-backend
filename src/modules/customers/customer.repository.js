import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class CustomerRepository {
  /**
   * Finds customer list for a restaurant with pagination and search.
   */
  async findCustomers(tenantContext, { page = 1, limit = 20, q } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        include: {
          addresses: {
            where: { deletedAt: null },
            orderBy: { isDefault: "desc" },
          },
          _count: {
            select: { orders: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Finds single active customer by ID within a tenant.
   */
  async findCustomerById(tenantContext, customerId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.customer.findFirst({
      where: {
        id: customerId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      include: {
        addresses: {
          where: { deletedAt: null },
          orderBy: { isDefault: "desc" },
        },
        _count: {
          select: { orders: true },
        },
      },
    });
  }

  /**
   * Finds active customer by phone within a tenant.
   */
  async findCustomerByPhone(tenantContext, phone) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.customer.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        phone,
        deletedAt: null,
      },
    });
  }

  /**
   * Creates new customer record.
   */
  async createCustomer(tenantContext, payload) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.customer.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        name: payload.name,
        phone: payload.phone,
        email: payload.email || null,
        notes: payload.notes || null,
      },
    });
  }

  /**
   * Updates customer using mandatory findFirst ownership check -> updateMany pattern (Section 12.3).
   */
  async updateCustomer(tenantContext, customerId, payload) {
    const existing = await this.findCustomerById(tenantContext, customerId);
    if (!existing) return null;

    await prisma.customer.updateMany({
      where: {
        id: customerId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
        ...(payload.email !== undefined ? { email: payload.email } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        updatedAt: new Date(),
      },
    });

    return this.findCustomerById(tenantContext, customerId);
  }

  /**
   * Soft deletes customer using findFirst ownership check -> updateMany pattern (Section 14.3).
   */
  async softDeleteCustomer(tenantContext, customerId) {
    const existing = await this.findCustomerById(tenantContext, customerId);
    if (!existing) return null;

    await prisma.customer.updateMany({
      where: {
        id: customerId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return existing;
  }

  /**
   * Finds customer orders across all branches of the tenant.
   */
  async findCustomerOrders(tenantContext, customerId, { page = 1, limit = 20 } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const customer = await this.findCustomerById(tenantContext, customerId);
    if (!customer) return null;

    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      customerId,
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          branch: {
            select: { id: true, name: true, code: true },
          },
          items: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Address Methods
   */
  async findAddresses(tenantContext, customerId) {
    const customer = await this.findCustomerById(tenantContext, customerId);
    if (!customer) return null;

    return prisma.customerAddress.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        customerId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findAddressById(tenantContext, customerId, addressId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.customerAddress.findFirst({
      where: {
        id: addressId,
        customerId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
    });
  }

  async createAddress(tenantContext, customerId, payload) {
    const customer = await this.findCustomerById(tenantContext, customerId);
    if (!customer) return null;

    const restaurantId = tenantContext.restaurantId;
    const activeCount = customer.addresses?.length || 0;
    const isDefault = activeCount === 0 || payload.isDefault === true;

    return prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, restaurantId, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
        data: {
          restaurantId,
          customerId,
          label: payload.label || "HOME",
          street: payload.street || null,
          city: payload.city || null,
          state: payload.state || null,
          postalCode: payload.postalCode || null,
          isDefault,
        },
      });
    });
  }

  async updateAddress(tenantContext, customerId, addressId, payload) {
    const existing = await this.findAddressById(tenantContext, customerId, addressId);
    if (!existing) return null;

    const restaurantId = tenantContext.restaurantId;
    const isDefault = payload.isDefault;

    return prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.customerAddress.updateMany({
          where: { customerId, restaurantId, deletedAt: null },
          data: { isDefault: false },
        });
      }

      let effectiveIsDefault = isDefault;
      if (isDefault === false && existing.isDefault) {
        const defaultCount = await tx.customerAddress.count({
          where: { customerId, restaurantId, deletedAt: null, isDefault: true },
        });
        if (defaultCount <= 1) {
          const nextDefault = await tx.customerAddress.findFirst({
            where: { customerId, restaurantId, deletedAt: null, id: { not: addressId } },
            orderBy: { createdAt: "desc" },
          });
          if (nextDefault) {
            await tx.customerAddress.updateMany({
              where: { id: nextDefault.id, customerId, restaurantId, deletedAt: null },
              data: { isDefault: true },
            });
          } else {
            effectiveIsDefault = true;
          }
        }
      }

      await tx.customerAddress.updateMany({
        where: { id: addressId, customerId, restaurantId, deletedAt: null },
        data: {
          ...(payload.label !== undefined ? { label: payload.label } : {}),
          ...(payload.street !== undefined ? { street: payload.street } : {}),
          ...(payload.city !== undefined ? { city: payload.city } : {}),
          ...(payload.state !== undefined ? { state: payload.state } : {}),
          ...(payload.postalCode !== undefined ? { postalCode: payload.postalCode } : {}),
          ...(effectiveIsDefault !== undefined ? { isDefault: effectiveIsDefault } : {}),
          updatedAt: new Date(),
        },
      });

      return tx.customerAddress.findFirst({
        where: { id: addressId, customerId, restaurantId, deletedAt: null },
      });
    });
  }

  async softDeleteAddress(tenantContext, customerId, addressId) {
    const existing = await this.findAddressById(tenantContext, customerId, addressId);
    if (!existing) return null;

    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({
        where: { id: addressId, customerId, restaurantId, deletedAt: null },
        data: { deletedAt: new Date(), isDefault: false },
      });

      // If the deleted address was default, promote the next latest active address
      if (existing.isDefault) {
        const nextDefault = await tx.customerAddress.findFirst({
          where: { customerId, restaurantId, deletedAt: null },
          orderBy: { createdAt: "desc" },
        });

        if (nextDefault) {
          await tx.customerAddress.updateMany({
            where: { id: nextDefault.id, customerId, restaurantId, deletedAt: null },
            data: { isDefault: true },
          });
        }
      }

      return existing;
    });
  }
}

export const customerRepository = new CustomerRepository();
export default customerRepository;
