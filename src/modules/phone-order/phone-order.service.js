import phoneOrderRepository from "./phone-order.repository.js";
import orderService from "../orders/order.service.js";
import customerService from "../customers/customer.service.js";
import branchRepository from "../branches/branch.repository.js";
import { NotFoundError } from "../../shared/errors/index.js";

export class PhoneOrderService {
  /**
   * Caller search — finds (or auto-creates) the customer by phone and returns their recent orders.
   */
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
        phone: customer.phone,
        email: customer.email,
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

  /**
   * Creates a phone order (source forced to PHONE, customer linked, default address used for delivery).
   */
  async createPhoneOrder(tenantContext, branchId, { type, customerPhone, customerName, items, notes }) {
    const customer = await customerService.findOrCreateCustomerByPhone(tenantContext, {
      phone: customerPhone,
      name: customerName || `عميل هاتف ${customerPhone}`,
    });

    let orderNotes = notes;
    if (type === "DELIVERY") {
      const defaultAddress = await phoneOrderRepository.findDefaultAddress(tenantContext, customer.id);
      if (defaultAddress) {
        const addrLine = [defaultAddress.street, defaultAddress.city, defaultAddress.state].filter(Boolean).join("، ");
        orderNotes = [orderNotes, addrLine ? `العنوان: ${addrLine}` : null].filter(Boolean).join(" | ") || null;
      }
    }

    const result = await orderService.createOrder(tenantContext, branchId, {
      source: "PHONE",
      type,
      customerId: customer.id,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, modifierIds: i.modifierIds })),
      notes: orderNotes,
    });

    return result.data;
  }
}

export const phoneOrderService = new PhoneOrderService();
export default phoneOrderService;