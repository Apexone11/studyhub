/**
 * In-memory cache with TTL (Time-To-Live) support.
 * Tracks hit/miss statistics for observability.
 * Simple Map-based storage with expiry timestamps.
 */

class MemoryCache {
  constructor(defaultTtlMs = 60000) {
    this.defaultTtlMs = defaultTtlMs
    this.store = new Map()
    this.stats = {
      hits: 0,
      misses: 0,
    }
  }

  /**
   * Get a value from cache.
   * Returns undefined if key doesn't exist or has expired.
   */
  get(key) {
    const entry = this.store.get(key)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.stats.misses++
      return undefined
    }

    this.stats.hits++
    return entry.value
  }

  /**
   * Set a value in cache with optional custom TTL.
   * Uses defaultTtlMs if ttlMs is not provided.
   */
  set(key, value, ttlMs) {
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs
    const expiresAt = Date.now() + ttl

    this.store.set(key, {
      value,
      expiresAt,
    })
  }

  /**
   * Delete a specific key from cache.
   */
  del(key) {
    this.store.delete(key)
  }

  /**
   * Clear all cached values.
   */
  clear() {
    this.store.clear()
    this.stats.hits = 0
    this.stats.misses = 0
  }

  /**
   * Get cache statistics.
   * Returns { size, hits, misses, hitRate }.
   */
  stats() {
    const size = this.store.size
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0

    return {
      size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      total,
      hitRate: `${hitRate}%`,
    }
  }
}

const cache = new MemoryCache()

module.exports = { cache, MemoryCache }
