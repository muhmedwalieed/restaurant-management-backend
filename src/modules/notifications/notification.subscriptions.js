import { DomainEvent, onEvent } from "../../shared/events/event-bus.js";
import notificationService from "./notification.service.js";
import logger from "../../config/logger.js";

/**
 * Registers in-process Domain Event listeners (Section 29) that convert business
 * events into in-app notifications. Listeners are fire-and-forget: a consumer
 * failure is logged and never breaks the producer flow.
 */
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
      await notificationService.notifyBranch(p.restaurantId, p.branchId, {
        type: "ORDER_STATUS_CHANGED",
        title: "Order status changed",
        body: `Order #${p.orderNumber} is now ${p.status}`,
        branchId: p.branchId,
        referenceType: "order",
        referenceId: p.orderId,
      });
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

// Register listeners as a side-effect so importing the module wires the bus (Section 29).
registerNotificationSubscriptions();

export default registerNotificationSubscriptions;