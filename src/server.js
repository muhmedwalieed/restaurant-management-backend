import "dotenv/config";
import http from "http";
import { Server } from "socket.io";

import app from "./app/app.js";
import env from "./config/env.js";
import prisma from "./lib/prisma.js";
import { disconnectRedis } from "./config/redis.js";
import { setSocketIo } from "./lib/socket.js";
import { verifyAccessToken } from "./utils/jwt.js";
import { registerRealtimeSubscriptions } from "./shared/events/realtime.subscriptions.js";
import logger from "./config/logger.js";

const PORT = env.PORT || 5000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

setSocketIo(io);

// Real-time: subscribe domain events → socket broadcasts to tenant rooms.
registerRealtimeSubscriptions();

io.on("connection", async (socket) => {
  try {
    // Authenticate the socket with the same JWT used by the REST API.
    const token = socket.handshake.auth?.token;
    if (!token) {
      throw new Error("Authentication token required");
    }
    const payload = verifyAccessToken(token);
    if (!payload?.restaurantId || !payload?.employeeId || !payload?.sessionId) {
      throw new Error("Invalid token payload");
    }

    // Assert the DB session is still ACTIVE (matches authenticate middleware).
    const session = await prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        restaurantId: payload.restaurantId,
        employeeId: payload.employeeId,
        status: "ACTIVE",
      },
    });
    if (!session) {
      throw new Error("Session expired or force logged out");
    }

    socket.data = {
      restaurantId: payload.restaurantId,
      branchId: payload.branchId || null,
      employeeId: payload.employeeId,
      role: payload.role || null,
    };
    await socket.join(`restaurant:${payload.restaurantId}`);
    await socket.join(`employee:${payload.employeeId}`);

    logger.info({ socketId: socket.id, restaurantId: payload.restaurantId }, "Socket connected and joined tenant room");
    socket.emit("realtime.connected", {
      restaurantId: payload.restaurantId,
      branchId: payload.branchId || null,
    });
  } catch (err) {
    logger.warn({ socketId: socket.id, err: err.message }, "Socket auth rejected");
    socket.emit("realtime.error", { message: "Authentication failed" });
    socket.disconnect(true);
  }
});

const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  httpServer.close(async () => {
    try {
      await prisma.$disconnect();
      await disconnectRedis();

      logger.info("Database and Redis connections closed.");
      logger.info("HTTP server closed.");

      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown:");
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const startServer = async () => {
  try {
    await prisma.$connect();

    logger.info("Database connected successfully.");

    httpServer.listen(PORT, () => {
      logger.info(`API: http://localhost:${PORT}`);
      logger.info(`Health: http://localhost:${PORT}/health`);
      logger.info(`Readiness: http://localhost:${PORT}/ready`);
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to start server:");

    await prisma.$disconnect();
    await disconnectRedis();

    process.exit(1);
  }
};

startServer();

export { io, httpServer };