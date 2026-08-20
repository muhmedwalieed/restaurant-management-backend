import { z } from "zod";

export const orderQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]).optional(),
    type: z.enum(["DINE_IN", "DELIVERY", "PICKUP"]).optional(),
    source: z.enum(["WHATSAPP", "QR", "WEBSITE", "CASHIER", "PHONE"]).optional(),
  }),
});

const orderItemInputSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  modifierIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const createOrderSchema = z.object({
  body: z.object({
    source: z.enum(["WHATSAPP", "QR", "WEBSITE", "CASHIER", "PHONE"]).optional().default("CASHIER"),
    type: z.enum(["DINE_IN", "DELIVERY", "PICKUP"]).optional().default("DINE_IN"),
    tableId: z.string().optional(),
    customerId: z.string().optional(),
    couponId: z.string().optional(),
    discountAmount: z.coerce.number().min(0).optional().default(0),
    notes: z.string().optional(),
    items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item"),
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
  body: z.object({
    tableToken: z.string().optional(),
    restaurantId: z.string().optional(),
    branchId: z.string().optional(),
    source: z.enum(["WHATSAPP", "QR", "WEBSITE", "CASHIER", "PHONE"]).optional(),
    type: z.enum(["DINE_IN", "DELIVERY", "PICKUP"]).optional(),
    items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item"),
    notes: z.string().optional(),
  }),
});
