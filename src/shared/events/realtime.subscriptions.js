import { DomainEvent, onEvent } from "./event-bus.js";
import { broadcastToRestaurant } from "../../lib/socket.js";

/**
 * Real-time layer: maps domain events to Socket.IO broadcasts on the tenant room.
 * Consumers (the frontend) re-fetch their affected react-query keys on these events.
 */
export function registerRealtimeSubscriptions() {
  onEvent(DomainEvent.ORDER_CREATED, (p) =>
    broadcastToRestaurant(p.restaurantId, "order.created", p)
  );
  onEvent(DomainEvent.ORDER_STATUS_CHANGED, (p) =>
    broadcastToRestaurant(p.restaurantId, "order.statusChanged", p)
  );
  onEvent(DomainEvent.ORDER_PAID, (p) =>
    broadcastToRestaurant(p.restaurantId, "order.paid", p)
  );
  onEvent(DomainEvent.CHAT_ASSIGNED, (p) =>
    broadcastToRestaurant(p.restaurantId, "conversation.assigned", p)
  );
  onEvent(DomainEvent.CONVERSATION_UPDATED, (p) =>
    broadcastToRestaurant(p.restaurantId, "conversation.updated", p)
  );
  onEvent(DomainEvent.CUSTOMER_UPDATED, (p) =>
    broadcastToRestaurant(p.restaurantId, "customer.updated", p)
  );
}

export default registerRealtimeSubscriptions;