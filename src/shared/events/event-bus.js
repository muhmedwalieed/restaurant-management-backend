import { EventEmitter } from "node:events";

export const DomainEvent = Object.freeze({
  ORDER_CREATED: "order.created",
  ORDER_STATUS_CHANGED: "order.statusChanged",
  ORDER_PAID: "order.paid",
  CHAT_ASSIGNED: "chat.assigned",
  CONVERSATION_UPDATED: "conversation.updated",
  CUSTOMER_UPDATED: "customer.updated",
  TABLE_SESSION_UPDATED: "tableSession.updated",
});

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitEvent(eventName, payload) {
  emitter.emit(eventName, payload);
}

export function onEvent(eventName, listener) {
  emitter.on(eventName, listener);
}

export default emitter;
