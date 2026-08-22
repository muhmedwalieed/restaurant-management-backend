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

export default { setSocketIo, getSocketIo };