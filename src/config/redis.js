import Redis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

let redisClient = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          logger.warn({ attempt: times }, "Redis max reconnect attempts reached. Stopping retries.");
          return null;
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

export async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    if (client.status !== "ready") {
      return false;
    }
    const pingResponse = await client.ping();
    return pingResponse === "PONG";
  } catch (error) {
    logger.warn({ err: error.message }, "Redis health check failed");
    return false;
  }
}

export async function disconnectRedis() {
  if (redisClient && (redisClient.status === "ready" || redisClient.status === "connecting")) {
    try {
      await redisClient.quit();
    } catch (err) {
      redisClient.disconnect();
    }
  }
}
