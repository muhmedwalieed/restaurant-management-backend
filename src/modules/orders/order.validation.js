import { z } from "zod";

export const orderQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]).optional(),
    type: z.enum(["DINE_IN", "DELIVERY", "PICKUP"]).optional(),
    source: z.enum(["WHATSAPP", "QR", "WEBSITE", "CASHIER", "PHONE"]).optional(),
    branchId: z.string().optional(),
    tableId: z.string().optional(),
  }),
});

const orderItemInputSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  modifierIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const createOrderSchema = z.object({
  body: z
    .object({
      source: z.enum(["WHATSAPP", "QR", "WEBSITE", "CASHIER", "PHONE"]).optional().default("CASHIER"),
      type: z.enum(["DINE_IN", "DELIVERY", "PICKUP"]).optional().default("DINE_IN"),
      tableId: z.string().optional(),
      customerId: z.string().optional(),
      customerPhone: z.string().min(3).max(30).optional(),
      customerName: z.string().max(100).optional(),
      couponId: z.string().optional(),
      discountAmount: z.coerce.number().min(0).optional().default(0),
      notes: z.string().optional(),
      address: z.string().max(500).optional(),
      items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item"),
    })
    .superRefine((data, ctx) => {
      if (data.type === "DELIVERY") {
        if (!data.customerName?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerName"], message: "Customer name is required for delivery orders" });
        }
        if (!data.customerPhone?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "Customer phone is required for delivery orders" });
        }
        if (!data.address?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["address"], message: "Delivery address is required for delivery orders" });
        }
      }
    }),
});

export const updateOrderStatusSchema = z.object({
  body: z.object({
    newStatus: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]),
    expectedVersion: z.coerce.number().int().min(1, "expectedVersion is required for optimistic locking"),
    reason: z.string().optional(),
  }),
});

export const cancelOrderSchema = z.object({
  body: z.object({
    expectedVersion: z.coerce.number().int().min(1, "expectedVersion is required for optimistic locking"),
    reason: z.string().min(1, "Cancellation reason is required"),
  }),
});

export const publicOrderSchema = z.object({
  body: z
    .object({
      tableToken: z.string().optional(),
      restaurantId: z.string().optional(),
      branchId: z.string().optional(),
      type: z.enum(["DELIVERY", "PICKUP"]).optional(),
      customerPhone: z.string().min(3).max(30).optional(),
      customerName: z.string().max(100).optional(),
      address: z.string().max(500).optional(),
      couponCode: z.string().min(3).max(50).optional(),
      items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item"),
      notes: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === "DELIVERY") {
        if (!data.customerName?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerName"], message: "Customer name is required for delivery orders" });
        }
        if (!data.customerPhone?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "Customer phone is required for delivery orders" });
        }
        if (!data.address?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["address"], message: "Delivery address is required for delivery orders" });
        }
      }
      if (data.type === "PICKUP" && !data.customerName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerName"], message: "Customer name is required for pickup orders" });
      }
    }),
});

export const trackOrderQuerySchema = z.object({
  query: z.object({
    slug: z.string().min(1, "Restaurant slug is required"),
    orderNumber: z.coerce.number().int().min(1, "Order number is required"),
    phone: z.string().min(3, "Customer phone is required").max(30),
  }),
});

export const posOrderSchema = z.object({
  body: z
    .object({
      type: z.enum(["DINE_IN", "DELIVERY", "PICKUP"]).optional().default("DINE_IN"),
      tableId: z.string().optional(),
      customerId: z.string().optional(),
      customerPhone: z.string().min(3).max(30).optional(),
      customerName: z.string().max(100).optional(),
      couponId: z.string().optional(),
      discountAmount: z.coerce.number().min(0).optional().default(0),
      notes: z.string().optional(),
      address: z.string().max(500).optional(),
      items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item"),
    })
    .superRefine((data, ctx) => {
      if (data.type === "DELIVERY") {
        if (!data.customerName?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerName"], message: "Customer name is required for delivery orders" });
        }
        if (!data.customerPhone?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "Customer phone is required for delivery orders" });
        }
        if (!data.address?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["address"], message: "Delivery address is required for delivery orders" });
        }
      }
    }),
});

export const paymentSchema = z.object({
  body: z.object({
    paymentMethod: z.enum(["CASH", "CARD", "ONLINE"]),
    amount: z.coerce.number().positive().optional(),
    expectedVersion: z.coerce.number().int().min(1, "expectedVersion is required for optimistic locking"),
  }),
});

export const refundSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "Refund reason is required"),
    expectedVersion: z.coerce.number().int().min(1, "expectedVersion is required for optimistic locking"),
  }),
});
