import { Router } from "express";
import { checkDatabaseHealth } from "../config/database.js";
import { checkRedisHealth } from "../config/redis.js";
import { sendSuccess } from "../shared/utils/response.js";

const router = Router();

router.get("/health", (req, res) => {
  sendSuccess(res, {
    message: "Restaurant Management API is alive",
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

router.get("/ready", async (req, res) => {
  const [dbHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const isReady = dbHealthy && redisHealthy;
  const requestId = req.requestId || req.id || "N/A";

  if (!isReady) {
    return res.status(503).json({
      success: false,
      status: "DOWN",
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? "UP" : "DOWN",
        redis: redisHealthy ? "UP" : "DOWN",
      },
      requestId,
    });
  }

  sendSuccess(res, {
    message: "Services are ready",
    data: {
      status: "UP",
      timestamp: new Date().toISOString(),
      services: {
        database: "UP",
        redis: "UP",
      },
    },
  });
});

export default router;
