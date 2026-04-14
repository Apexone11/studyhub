/**
 * redis.js -- Upstash Redis client with cache-aside helper.
 *
 * Phase 6 Step 3: Redis caching layer.
 *
 * Graceful degradation is mandatory: if Redis is unavailable (no env vars,
 * network error, etc.), every function falls through to the direct DB
 * fetcher. The site is slower but never broken.
 *
 * Environment variables:
 *   UPSTASH_REDIS_URL   -- Upstash REST URL
 *   UPSTASH_REDIS_TOKEN -- Upstash REST token
 */

let redis = null

// Lazy-init: only create the client if env vars are present.
// We use dynamic import because @upstash/redis may not be installed yet.
function getRedis() {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
    return null
  }
  try {
    const { Redis } = require('@upstash/redis')
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    })
    return redis
  } catch {
    // @upstash/redis not installed -- fall through gracefully
    return null
  }
}

/**
 * Cache-aside helper. Returns cached value if fresh, otherwise calls `fetcher`,
 * stores the result, and returns it.
 *
 * @param {string} key         -- Redis key
 * @param {Function} fetcher   -- async function that returns the data
 * @param {number} ttlSeconds  -- how long to cache (default 300 = 5 min)
 * @returns {Promise<*>}       -- the data (from cache or fetcher)
 */
async function cached(key, fetcher, ttlSeconds = 300) {
  const client = getRedis()
  if (!client) return fetcher()

  try {
    const hit = await client.get(key)
    if (hit !== null && hit !== undefined) {
      // Upstash returns parsed JSON automatically
      return hit
    }
  } catch {
    // Redis down -- fall through to fetcher
  }

  const data = await fetcher()

  try {
    await client.set(key, JSON.stringify(data), { ex: ttlSeconds })
  } catch {
    // Best effort -- cache write failure is not fatal
  }

  return data
}

/**
 * Invalidate one or more cache keys.
 * @param {...string} keys -- one or more Redis keys to delete
 */
async function invalidate(...keys) {
  const client = getRedis()
  if (!client || keys.length === 0) return
  try {
    await client.del(...keys)
  } catch {
    // Best effort
  }
}

/**
 * Ping Redis to check connectivity. Returns 'ok' or 'unavailable'.
 */
async function ping() {
  const client = getRedis()
  if (!client) return 'unavailable'
  try {
    const result = await client.ping()
    return result === 'PONG' ? 'ok' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

module.exports = { getRedis, cached, invalidate, ping }
