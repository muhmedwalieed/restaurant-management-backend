import { EventEmitter } from "node:events";

/**
 * Domain Event names (Section 29). Emitted in-process to decouple modules:
 * a producer (e.g. `orders`) never knows its consumers (`notifications`, `audit-logs`).
 */
export const DomainEvent = Object.freeze({
  ORDER_CREATED: "order.created",
  ORDER_STATUS_CHANGED: "order.statusChanged",
  ORDER_PAID: "order.paid",
  CHAT_ASSIGNED: "chat.assigned",
});

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

/**
 * Emits a domain event. Listeners are fire-and-forget; they must swallow their own
 * errors so a failed consumer never breaks the producer's business flow.
 */
export function emitEvent(eventName, payload) {
  emitter.emit(eventName, payload);
}

/**
 * Registers a domain-event listener.
 */
export function onEvent(eventName, listener) {
  emitter.on(eventName, listener);
}

export default emitter;