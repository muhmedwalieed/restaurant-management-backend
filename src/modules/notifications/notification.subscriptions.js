import { DomainEvent, onEvent } from "../../shared/events/event-bus.js";
import notificationService from "./notification.service.js";
import logger from "../../config/logger.js";
import prisma from "../../lib/prisma.js";
import whatsAppService from "../whatsapp/whatsapp.service.js";
import templateService from "../templates/template.service.js";

function safe(listener) {
  return (payload) => {
    listener(payload).catch((err) => {
      logger.warn({ err: err.message }, "Notification event listener failed");
    });
  };
}

export function registerNotificationSubscriptions() {
  onEvent(
    DomainEvent.ORDER_CREATED,
    safe(async (p) => {
      await notificationService.notifyBranch(p.restaurantId, p.branchId, {
        type: "ORDER_CREATED",
        title: "New order received",
        body: `New ${p.source} order #${p.orderNumber} — total ${p.total}`,
        branchId: p.branchId,
        referenceType: "order",
        referenceId: p.orderId,
      });
    })
  );

  onEvent(
    DomainEvent.ORDER_STATUS_CHANGED,
    safe(async (p) => {
      // 1. In-app staff notification
      await notificationService.notifyBranch(p.restaurantId, p.branchId, {
        type: "ORDER_STATUS_CHANGED",
        title: "Order status changed",
        body: `Order #${p.orderNumber} is now ${p.status}`,
        branchId: p.branchId,
        referenceType: "order",
        referenceId: p.orderId,
      });

      // 2. WhatsApp Customer Notification for Status Updates
      try {
        const tenantContext = { restaurantId: p.restaurantId };
        const order = await prisma.order.findFirst({
          where: { id: p.orderId, restaurantId: p.restaurantId },
          include: { customer: true },
        });

        const customerPhone = order?.customer?.phone;
        if (customerPhone) {
          if (p.status === "CONFIRMED") {
            const text = await templateService.render("ORDER_STATUS_CONFIRMED", tenantContext, {
              orderNumber: order.orderNumber,
              customerName: order.customer?.name || "",
            });
            await whatsAppService.sendMessage(tenantContext, { to: customerPhone, text });
          } else if (p.status === "OUT_FOR_DELIVERY") {
            const addressText = order.address ? `\n*العنوان:* ${order.address}` : "";
            const text = await templateService.render("ORDER_STATUS_OUT_FOR_DELIVERY", tenantContext, {
              orderNumber: order.orderNumber,
              addressText,
              customerName: order.customer?.name || "",
            });
            await whatsAppService.sendMessage(tenantContext, { to: customerPhone, text });
          } else if (p.status === "DELIVERED") {
            const text = await templateService.render("ORDER_STATUS_DELIVERED", tenantContext, {
              orderNumber: order.orderNumber,
              customerName: order.customer?.name || "",
            });
            await whatsAppService.sendMessage(tenantContext, { to: customerPhone, text });

            // Set state to AWAITING_ORDER_FEEDBACK
            try {
              const { default: automationRepo } = await import("../whatsapp-automation/automation.repository.js");
              const { default: waRepo } = await import("../whatsapp/whatsapp.repository.js");
              const conn = await waRepo.findConnectionByTenant(tenantContext);
              if (conn) {
                const waConv = await automationRepo.findConversationByPhone(tenantContext, conn.id, customerPhone);
                if (waConv) {
                  await automationRepo.updateConversation(tenantContext, waConv.id, {
                    state: "WELCOME",
                    status: "ACTIVE",
                    cart: [],
                    selectedCategoryId: null,
                    address: null,
                    lastInboundAt: new Date(),
                  });
                }
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, "WhatsApp order status notification failed");
      }
    })
  );

  onEvent(
    DomainEvent.ORDER_PAID,
    safe(async (p) => {
      await notificationService.notifyBranch(p.restaurantId, p.branchId, {
        type: "ORDER_PAID",
        title: "Order paid",
        body: `Order #${p.orderNumber} was paid (${p.total})`,
        branchId: p.branchId,
        referenceType: "order",
        referenceId: p.orderId,
      });
    })
  );

  onEvent(
    DomainEvent.CHAT_ASSIGNED,
    safe(async (p) => {
      await notificationService.createForEmployee(
        { restaurantId: p.restaurantId },
        {
          targetEmployeeId: p.agentId,
          type: "CHAT_ASSIGNED",
          title: "Conversation assigned to you",
          body: `Support conversation${p.customerPhone ? ` with ${p.customerPhone}` : ""} was assigned to you`,
          referenceType: "conversation",
          referenceId: p.conversationId,
        }
      );
    })
  );
}

registerNotificationSubscriptions();

export default registerNotificationSubscriptions;
