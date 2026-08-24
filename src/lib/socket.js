/**
 * Hold the Socket.IO server instance set by server.js, so any module can broadcast
 * to a tenant room without importing the HTTP entry point (which would start the server).
 */
let io = null;

export function setSocketIo(instance) {
  io = instance;
}

export function getSocketIo() {
  return io;
}

/**
 * Broadcasts an event to every socket joined to a restaurant room.
 * Safe no-op when the socket server is not running.
 */
export function broadcastToRestaurant(restaurantId, event, payload) {
  try {
    io?.to(`restaurant:${restaurantId}`).emit(event, payload);
  } catch (err) {
    // Broadcasting must never break the business flow
  }
}

export default { setSocketIo, getSocketIo, broadcastToRestaurant };