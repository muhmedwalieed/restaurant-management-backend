import "dotenv/config";
import http from "http";
import { Server } from "socket.io";

import app from "./app/app.js";
import prisma from "./lib/prisma.js";

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} - ${reason}`);
  });
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);

  httpServer.close(async () => {
    try {
      await prisma.$disconnect();

      console.log("Database connection closed.");
      console.log("HTTP server closed.");

      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const startServer = async () => {
  try {
    await prisma.$connect();

    console.log("Database connected successfully.");

    httpServer.listen(PORT, () => {
      console.log(`
Restaurant Management API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Environment : ${process.env.NODE_ENV || "development"}
Port        : ${PORT}
API         : http://localhost:${PORT}
Health      : http://localhost:${PORT}/health
Socket.IO   : enabled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (error) {
    console.error("Failed to start server:", error);

    await prisma.$disconnect();

    process.exit(1);
  }
};

startServer();

export { io, httpServer };