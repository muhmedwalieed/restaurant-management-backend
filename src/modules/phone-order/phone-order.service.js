import phoneOrderRepository from "./phone-order.repository.js";
import orderService from "../orders/order.service.js";
import customerService from "../customers/customer.service.js";
import customerRepository from "../customers/customer.repository.js";
import branchRepository from "../branches/branch.repository.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";

export class PhoneOrderService {

  async lookup(tenantContext, { phone }) {
    const customer = await customerRepository.findCustomerByPhone(tenantContext, phone);
    if (!customer) {
      return {
        customer: null,
        addresses: [],
        defaultAddress: null,
        recentOrders: [],
      };
    }

    const orders = await phoneOrderRepository.findRecentOrdersByCustomer(tenantContext, customer.id, 5);
    const savedAddresses = (await customerRepository.findAddresses(tenantContext, customer.id)) || [];
    const defaultAddress = savedAddresses.find((a) => a.isDefault) || savedAddresses[0] || null;

    const labelMap = {
      HOME: "المنزل",
      WORK: "العمل",
      OTHER: "أخرى",
    };

    const formattedSaved = savedAddresses.map((a, idx) => ({
      id: a.id,
      label: labelMap[a.label] || a.label || (idx === 0 ? "المنزل" : `عنوان ${idx + 1}`),
      street: a.street,
      city: a.city,
      state: a.state,
      isDefault: a.isDefault,
      formatted: [a.street, a.city, a.state].filter(Boolean).join("، ") || a.street || "",
    }));

    const savedTexts = new Set(formattedSaved.map((a) => a.formatted.trim().toLowerCase()));
    const orderAddresses = [];
    for (const ord of orders) {
      if (ord.address && ord.address.trim()) {
        const clean = ord.address.trim();
        if (!savedTexts.has(clean.toLowerCase())) {
          savedTexts.add(clean.toLowerCase());
          orderAddresses.push({
            id: `ord_${ord.id}`,
            label: null,
            street: clean,
            isDefault: false,
            formatted: clean,
            isFromRecentOrder: true,
          });
        }
      }
    }

    const allAddresses = [...formattedSaved, ...orderAddresses];

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        notes: customer.notes,
      },
      addresses: allAddresses,
      address: defaultAddress
        ? [defaultAddress.street, defaultAddress.city, defaultAddress.state].filter(Boolean).join("، ") || defaultAddress.street
        : orders[0]?.address || (allAddresses[0]?.formatted || null),
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
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        modifierIds: i.modifierIds,
        modifiers: i.modifiers,
        notes: i.notes,
      })),
      notes: notes,
    });

    return result.data;
  }
}

export const phoneOrderService = new PhoneOrderService();
export default phoneOrderService;
