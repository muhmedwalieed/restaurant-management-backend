import customerRepository from "./customer.repository.js";
import { ConflictError, NotFoundError } from "../../shared/errors/index.js";

export class CustomerService {
  /**
   * Derives firstName / lastName / full name. Accepts firstName+lastName,
   * or a legacy full `name` as a fallback.
   */
  normalizeName(payload) {
    const firstName = payload.firstName?.trim() || payload.name?.trim() || "";
    const lastName = payload.lastName?.trim() || null;
    return {
      firstName,
      lastName,
      name: [firstName, lastName].filter(Boolean).join(" "),
    };
  }

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
    const phone = payload.phone.trim();
    const existing = await customerRepository.findCustomerByPhone(tenantContext, phone);
    if (existing) {
      throw new ConflictError(`Customer with phone '${phone}' already exists in this restaurant`);
    }

    const names = this.normalizeName(payload);
    const phones = [phone, ...(payload.phones || [])].map((p) => p.trim()).filter(Boolean);
    const deduped = [...new Set(phones)];

    try {
      return await customerRepository.createCustomer(tenantContext, {
        ...names,
        phone,
        phones: deduped,
        notes: payload.notes,
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictError(`Customer with phone '${phone}' already exists in this restaurant`);
      }
      throw error;
    }
  }

  async updateCustomer(tenantContext, customerId, payload) {
    const customer = await this.getCustomerById(tenantContext, customerId);

    const newPhone = payload.phone ? payload.phone.trim() : customer.phone;
    if (newPhone !== customer.phone) {
      const phoneConflict = await customerRepository.findCustomerByPhone(tenantContext, newPhone);
      if (phoneConflict && phoneConflict.id !== customerId) {
        throw new ConflictError(`Customer with phone '${newPhone}' already exists in this restaurant`);
      }
    }

    // Keep existing first/last name when only a partial update is sent
    const names = this.normalizeName({ ...customer, ...payload });
    const phones = payload.phones
      ? [...new Set(payload.phones.map((p) => p.trim()).filter(Boolean))]
      : undefined;

    try {
      const updated = await customerRepository.updateCustomer(tenantContext, customerId, {
        firstName: names.firstName,
        lastName: names.lastName,
        name: names.name,
        phone: payload.phone ? newPhone : undefined,
        phones,
        notes: payload.notes,
      });
      if (!updated) {
        throw new NotFoundError("Customer not found or access denied");
      }
      return updated;
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictError(`Customer with phone '${newPhone}' already exists in this restaurant`);
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
        const fullName = (name || `Customer ${phone}`).trim();
        const parts = fullName.split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

        return await tx.customer.create({
          data: {
            restaurantId: tenantContext.restaurantId,
            firstName,
            lastName,
            name: fullName,
            phone,
            phones: {
              create: [{ restaurantId: tenantContext.restaurantId, phone, isDefault: true }],
            },
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
