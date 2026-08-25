
let io = null;

export function setSocketIo(instance) {
  io = instance;
}

export function getSocketIo() {
  return io;
}

export function broadcastToRestaurant(restaurantId, event, payload) {
  try {
    io?.to(`restaurant:${restaurantId}`).emit(event, payload);
  } catch (err) {

  }
}

export default { setSocketIo, getSocketIo, broadcastToRestaurant };
