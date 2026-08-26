import { DomainEvent, onEvent } from "./event-bus.js";
import { broadcastToRestaurant } from "../../lib/socket.js";

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
  onEvent(DomainEvent.TABLE_SESSION_UPDATED, (p) =>
    broadcastToRestaurant(p.restaurantId, "tableSession.updated", p)
  );
}

export default registerRealtimeSubscriptions;
