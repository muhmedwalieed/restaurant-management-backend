import Redis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

let redisClient = null;
let redisSubscriber = null;

function createClient() {
  const client = new Redis(env.REDIS_URL, {
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

  client.on("error", (err) => {
    logger.warn({ err: err.message }, "Redis connection error");
  });

  return client;
}

export function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient();
  }
  return redisClient;
}

export function getRedisSubscriber() {
  if (!redisSubscriber) {
    redisSubscriber = getRedisClient().duplicate();
    redisSubscriber.on("error", (err) => {
      logger.warn({ err: err.message }, "Redis subscriber connection error");
    });
  }
  return redisSubscriber;
}

async function ensureConnected(client) {
  if (!client) return;
  if (client.status === "wait") {
    await client.connect();
  }
}

export async function connectRedis() {
  try {
    const client = getRedisClient();
    await ensureConnected(client);
    logger.info("Redis connected successfully.");
    return true;
  } catch (error) {
    logger.warn({ err: error.message }, "Redis connection failed at startup; cache and realtime adapter will degrade");
    return false;
  }
}

const redis = getRedisClient();

export default redis;

export async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    await ensureConnected(client);
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
  const quit = async (client) => {
    if (!client) return;
    if (client.status === "ready" || client.status === "connecting" || client.status === "wait") {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  };

  await quit(redisSubscriber);
  redisSubscriber = null;
  await quit(redisClient);
}
