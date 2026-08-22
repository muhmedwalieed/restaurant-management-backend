import "dotenv/config";
import http from "http";
import { Server } from "socket.io";

import app from "./app/app.js";
import env from "./config/env.js";
import prisma from "./lib/prisma.js";
import { disconnectRedis } from "./config/redis.js";
import { setSocketIo } from "./lib/socket.js";
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

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, `Socket connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    logger.info({ socketId: socket.id, reason }, `Socket disconnected: ${socket.id} - ${reason}`);
  });
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