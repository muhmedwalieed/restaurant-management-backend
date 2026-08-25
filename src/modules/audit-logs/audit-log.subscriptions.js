import { DomainEvent, onEvent } from "../../shared/events/event-bus.js";
import { AuditAction } from "./audit-log.service.js";
import auditLogService from "./audit-log.service.js";
import logger from "../../config/logger.js";

function safe(listener) {
  return (payload) => {
    listener(payload).catch((err) => {
      logger.warn({ err: err.message }, "Audit log event listener failed");
    });
  };
}

export function registerAuditLogSubscriptions() {
  onEvent(
    DomainEvent.ORDER_CREATED,
    safe(async (p) => {
      await auditLogService.record(
        { restaurantId: p.restaurantId },
        {
          branchId: p.branchId,
          actorEmployeeId: p.actorEmployeeId || null,
          action: AuditAction.ORDER_CREATED,
          entityType: "order",
          entityId: p.orderId,
          metadata: { orderNumber: p.orderNumber, source: p.source, type: p.type, total: p.total },
        }
      );
    })
  );

  onEvent(
    DomainEvent.ORDER_STATUS_CHANGED,
    safe(async (p) => {
      await auditLogService.record(
        { restaurantId: p.restaurantId },
        {
          branchId: p.branchId,
          actorEmployeeId: p.actorEmployeeId || null,
          action: p.status === "CANCELLED" ? AuditAction.ORDER_CANCELLED : AuditAction.ORDER_STATUS_CHANGED,
          entityType: "order",
          entityId: p.orderId,
          metadata: { orderNumber: p.orderNumber, status: p.status },
        }
      );
    })
  );

  onEvent(
    DomainEvent.ORDER_PAID,
    safe(async (p) => {
      await auditLogService.record(
        { restaurantId: p.restaurantId },
        {
          branchId: p.branchId,
          actorEmployeeId: p.actorEmployeeId || null,
          action: AuditAction.ORDER_PAID,
          entityType: "order",
          entityId: p.orderId,
          metadata: { orderNumber: p.orderNumber, total: p.total },
        }
      );
    })
  );

  onEvent(
    DomainEvent.CHAT_ASSIGNED,
    safe(async (p) => {
      await auditLogService.record(
        { restaurantId: p.restaurantId },
        {
          actorEmployeeId: p.actorEmployeeId || null,
          action: AuditAction.CHAT_ASSIGNED,
          entityType: "conversation",
          entityId: p.conversationId,
          metadata: { assignedAgentId: p.agentId, customerPhone: p.customerPhone },
        }
      );
    })
  );
}

registerAuditLogSubscriptions();

export default registerAuditLogSubscriptions;
