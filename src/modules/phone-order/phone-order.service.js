import phoneOrderRepository from "./phone-order.repository.js";
import orderService from "../orders/order.service.js";
import customerService from "../customers/customer.service.js";
import branchRepository from "../branches/branch.repository.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";

export class PhoneOrderService {

  async lookup(tenantContext, { phone }) {
    const customer = await customerService.findOrCreateCustomerByPhone(tenantContext, {
      phone,
      name: `عميل هاتف ${phone}`,
    });

    const orders = await phoneOrderRepository.findRecentOrdersByCustomer(tenantContext, customer.id, 5);
    const defaultAddress = await phoneOrderRepository.findDefaultAddress(tenantContext, customer.id);

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        notes: customer.notes,
      },
      defaultAddress: defaultAddress
        ? {
            id: defaultAddress.id,
            label: defaultAddress.label,
            street: defaultAddress.street,
            city: defaultAddress.city,
            state: defaultAddress.state,
          }
        : null,
      recentOrders: orders,
    };
  }

  async createPhoneOrder(tenantContext, branchId, { type, customerPhone, customerName, address, items, notes }) {
    const customer = await customerService.findOrCreateCustomerByPhone(tenantContext, {
      phone: customerPhone,
      name: customerName || `عميل هاتف ${customerPhone}`,
    });

    let orderAddress = address?.trim();
    if (type === "DELIVERY" && !orderAddress) {
      const defaultAddress = await phoneOrderRepository.findDefaultAddress(tenantContext, customer.id);
      if (defaultAddress) {
        orderAddress = [defaultAddress.street, defaultAddress.city, defaultAddress.state].filter(Boolean).join("، ");
      }
    }
    if (type === "DELIVERY" && !orderAddress) {
      throw new BusinessRuleError("Delivery address is required for DELIVERY orders");
    }

    const result = await orderService.createOrder(tenantContext, branchId, {
      source: "PHONE",
      type,
      customerId: customer.id,
      address: orderAddress || null,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, modifierIds: i.modifierIds, notes: i.notes })),
      notes: notes,
    });

    return result.data;
  }
}

export const phoneOrderService = new PhoneOrderService();
export default phoneOrderService;
