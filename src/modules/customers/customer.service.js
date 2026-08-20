import customerRepository from "./customer.repository.js";
import { ConflictError, NotFoundError } from "../../shared/errors/index.js";

export class CustomerService {
  async listCustomers(tenantContext, { page = 1, limit = 20, q } = {}) {
    const { items, total } = await customerRepository.findCustomers(tenantContext, {
      page,
      limit,
      q,
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getCustomerById(tenantContext, customerId) {
    const customer = await customerRepository.findCustomerById(tenantContext, customerId);
    if (!customer) {
      throw new NotFoundError("Customer not found or access denied");
    }
    return customer;
  }

  async createCustomer(tenantContext, payload) {
    const existing = await customerRepository.findCustomerByPhone(tenantContext, payload.phone);
    if (existing) {
      throw new ConflictError(`Customer with phone '${payload.phone}' already exists in this restaurant`);
    }

    try {
      return await customerRepository.createCustomer(tenantContext, payload);
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictError(`Customer with phone '${payload.phone}' already exists in this restaurant`);
      }
      throw error;
    }
  }

  async updateCustomer(tenantContext, customerId, payload) {
    const customer = await this.getCustomerById(tenantContext, customerId);

    if (payload.phone && payload.phone !== customer.phone) {
      const phoneConflict = await customerRepository.findCustomerByPhone(tenantContext, payload.phone);
      if (phoneConflict && phoneConflict.id !== customerId) {
        throw new ConflictError(`Customer with phone '${payload.phone}' already exists in this restaurant`);
      }
    }

    try {
      const updated = await customerRepository.updateCustomer(tenantContext, customerId, payload);
      if (!updated) {
        throw new NotFoundError("Customer not found or access denied");
      }
      return updated;
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictError(`Customer with phone '${payload.phone}' already exists in this restaurant`);
      }
      throw error;
    }
  }

  async deleteCustomer(tenantContext, customerId) {
    await this.getCustomerById(tenantContext, customerId);
    const deleted = await customerRepository.softDeleteCustomer(tenantContext, customerId);
    if (!deleted) {
      throw new NotFoundError("Customer not found or access denied");
    }
    return deleted;
  }

  async getCustomerOrderHistory(tenantContext, customerId, { page = 1, limit = 20 } = {}) {
    await this.getCustomerById(tenantContext, customerId);
    const result = await customerRepository.findCustomerOrders(tenantContext, customerId, { page, limit });
    if (!result) {
      throw new NotFoundError("Customer not found or access denied");
    }

    const totalPages = Math.ceil(result.total / limit) || 1;
    return {
      items: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    };
  }

  async listAddresses(tenantContext, customerId) {
    await this.getCustomerById(tenantContext, customerId);
    const addresses = await customerRepository.findAddresses(tenantContext, customerId);
    if (!addresses) {
      throw new NotFoundError("Customer not found or access denied");
    }
    return addresses;
  }

  async addAddress(tenantContext, customerId, payload) {
    await this.getCustomerById(tenantContext, customerId);
    const address = await customerRepository.createAddress(tenantContext, customerId, payload);
    if (!address) {
      throw new NotFoundError("Customer not found or access denied");
    }
    return address;
  }

  async updateAddress(tenantContext, customerId, addressId, payload) {
    await this.getCustomerById(tenantContext, customerId);
    const address = await customerRepository.findAddressById(tenantContext, customerId, addressId);
    if (!address) {
      throw new NotFoundError("Address not found or access denied");
    }

    return customerRepository.updateAddress(tenantContext, customerId, addressId, payload);
  }

  async deleteAddress(tenantContext, customerId, addressId) {
    await this.getCustomerById(tenantContext, customerId);
    const address = await customerRepository.findAddressById(tenantContext, customerId, addressId);
    if (!address) {
      throw new NotFoundError("Address not found or access denied");
    }

    return customerRepository.softDeleteAddress(tenantContext, customerId, addressId);
  }

  /**
   * Helper to find or create customer by phone for order auto-link (Atomic transaction).
   */
  async findOrCreateCustomerByPhone(tenantContext, { phone, name }) {
    if (!phone) return null;

    const prisma = (await import("../../lib/prisma.js")).default;

    return prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: {
          restaurantId: tenantContext.restaurantId,
          phone,
          deletedAt: null,
        },
      });
      if (existing) return existing;

      try {
        return await tx.customer.create({
          data: {
            restaurantId: tenantContext.restaurantId,
            name: name || `Customer ${phone}`,
            phone,
          },
        });
      } catch (error) {
        if (error?.code === "P2002") {
          return tx.customer.findFirst({
            where: {
              restaurantId: tenantContext.restaurantId,
              phone,
              deletedAt: null,
            },
          });
        }
        throw error;
      }
    });
  }
}

export const customerService = new CustomerService();
export default customerService;
