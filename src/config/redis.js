import Redis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

/**
 * Singleton Redis client setup using ioredis.
 * Configured with standard retry strategy and error handlers.
 */
let redisClient = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          logger.warn({ attempt: times }, "Redis max reconnect attempts reached. Stopping retries.");
          return null; // Stop retrying after 5 attempts
        }
        const delay = Math.min(times * 100, 2000);
        logger.warn({ attempt: times, nextDelayMs: delay }, "Redis connection retry scheduled");
        return delay;
      },
    });

    redisClient.on("error", (err) => {
      logger.warn({ err: err.message }, "Redis connection error");
    });
  }

  return redisClient;
}

const redis = getRedisClient();

export default redis;

/**
 * Checks Redis connectivity for readiness health probes.
 * @returns {Promise<boolean>}
 */
export async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    const pingResponse = await client.ping();
    return pingResponse === "PONG";
  } catch (error) {
    logger.warn({ err: error.message }, "Redis health check failed");
    return false;
  }
}

/**
 * Disconnects Redis connection cleanly.
 */
export async function disconnectRedis() {
  if (redisClient && (redisClient.status === "ready" || redisClient.status === "connecting")) {
    try {
      await redisClient.quit();
    } catch (err) {
      redisClient.disconnect();
    }
  }
}
