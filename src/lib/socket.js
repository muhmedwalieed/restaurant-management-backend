import logger from "../config/logger.js";

let io = null;

export function setSocketIo(instance) {
  io = instance;
}

export function getSocketIo() {
  return io;
}

export function broadcastToRestaurant(restaurantId, event, payload, { branchId } = {}) {
  try {
    if (branchId) {
      io?.to(`branch:${branchId}`).to(`restaurant:${restaurantId}`).emit(event, payload);
      return;
    }
    io?.to(`restaurant:${restaurantId}`).emit(event, payload);
  } catch (err) {
    logger.warn({ err: err.message, event, restaurantId }, "Socket broadcast failed");
  }
}

export function broadcastToEmployee(employeeId, event, payload) {
  try {
    io?.to(`employee:${employeeId}`).emit(event, payload);
  } catch (err) {
    logger.warn({ err: err.message, event, employeeId }, "Socket employee broadcast failed");
  }
}

export default { setSocketIo, getSocketIo, broadcastToRestaurant, broadcastToEmployee };
