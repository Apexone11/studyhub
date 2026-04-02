/**
 * library.cache.js -- Simple TTL-based in-memory cache for library API responses.
 */

class MemoryCache {
  constructor() {
    this._store = new Map()
  }

  /**
   * Get a value from the cache.
   * Returns null if the key does not exist or has expired.
   */
  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key)
      return null
    }

    return entry.value
  }

  /**
   * Set a value in the cache with a TTL.
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    this._store.clear()
  }

  /**
   * Get the number of entries currently in the cache.
   */
  get size() {
    return this._store.size
  }
}

module.exports = new MemoryCache()
