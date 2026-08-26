import redis from "../../config/redis.js";
import logger from "../../config/logger.js";

const inFlightRequests = new Map();

/**
 * Executes fetcherFn with automatic Redis caching and Singleflight Stampede protection.
 * If Redis is down or returns an error, gracefully falls back to fetcherFn without throwing.
 *
 * @param {string} key - The Redis cache key
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @param {Function} fetcherFn - Async function to fetch data on cache miss
 * @param {Object} [options] - Additional options (e.g. alternateKeys, skipCache)
 * @returns {Promise<any>} The cached or freshly fetched data
 */
export async function withCache(key, ttlSeconds, fetcherFn, options = {}) {
  if (!key || options.skipCache) {
    return fetcherFn();
  }

  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn({ err: err.message, key }, "Redis read error in withCache, falling back to fetcher");
  }

  let inFlight = inFlightRequests.get(key);
  if (!inFlight) {
    inFlight = (async () => {
      const data = await fetcherFn();
      if (data !== undefined && data !== null) {
        try {
          const serialized = JSON.stringify(data);
          const pipeline = redis.pipeline();
          pipeline.set(key, serialized, "EX", ttlSeconds);

          if (options.alternateKeys && Array.isArray(options.alternateKeys)) {
            for (const altKey of options.alternateKeys) {
              if (altKey) {
                pipeline.set(altKey, serialized, "EX", ttlSeconds);
              }
            }
          }

          await pipeline.exec();
        } catch (err) {
          logger.warn({ err: err.message, key }, "Redis write error in withCache");
        }
      }
      return data;
    })();

    inFlightRequests.set(key, inFlight);
  }

  try {
    return await inFlight;
  } finally {
    if (inFlightRequests.get(key) === inFlight) {
      inFlightRequests.delete(key);
    }
  }
}

/**
 * Safely invalidates one or more cache keys in Redis.
 *
 * @param {...string} keys - Cache keys to delete
 * @returns {Promise<void>}
 */
export async function invalidateCacheKeys(...keys) {
  const validKeys = keys.filter(Boolean);
  if (validKeys.length === 0) return;

  try {
    await redis.del(...validKeys);
  } catch (err) {
    logger.warn({ err: err.message, keys: validKeys }, "Failed to invalidate cache keys");
  }
}

export default {
  withCache,
  invalidateCacheKeys,
};
