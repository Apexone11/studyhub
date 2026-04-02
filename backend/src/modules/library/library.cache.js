/**
 * library.cache.js -- TTL-based in-memory cache with LRU eviction for library API responses.
 */

const MAX_ENTRIES = 500

class MemoryCache {
  constructor(maxEntries = MAX_ENTRIES) {
    this._store = new Map()
    this._maxEntries = maxEntries
  }

  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key)
      return null
    }

    // Move to end for LRU tracking (Map preserves insertion order)
    this._store.delete(key)
    this._store.set(key, entry)

    return entry.value
  }

  set(key, value, ttlMs) {
    // Evict oldest entry if at capacity
    if (this._store.size >= this._maxEntries && !this._store.has(key)) {
      const oldest = this._store.keys().next().value
      this._store.delete(oldest)
    }

    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  clear() {
    this._store.clear()
  }

  get size() {
    return this._store.size
  }
}

module.exports = new MemoryCache()
