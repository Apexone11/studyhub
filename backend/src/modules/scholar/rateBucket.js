/**
 * rateBucket.js — Per-source token-bucket rate limiter for Scholar adapters.
 *
 * In-memory only (master plan §18.5 + L5-CRIT-3). When a bucket is empty
 * the caller (the adapter) returns `{ source, results: [], throttled: true }`
 * instead of blocking. A short refill interval is used so the bucket
 * tracks real-time even under bursty fan-outs.
 *
 * Per-source budgets:
 *   semanticScholar: refill 1 req/s, burst 5
 *   openAlex:        refill 8 req/s, burst 30
 *   crossref:        refill 30 req/s, burst 100
 *   arxiv:           refill 0.33 req/s (1 every 3s), burst 1     # arXiv ToS
 *   unpaywall:       refill 8 req/s, burst 30
 */

// Tokens-per-millisecond. We avoid floats > 1 by storing fractional refill rate.
const BUCKETS = {
  semanticScholar: { capacity: 5, refillPerMs: 1 / 1000 }, // 1/s
  openAlex: { capacity: 30, refillPerMs: 8 / 1000 }, // 8/s
  crossref: { capacity: 100, refillPerMs: 30 / 1000 }, // 30/s
  arxiv: { capacity: 1, refillPerMs: 1 / 3000 }, // 1 per 3s
  unpaywall: { capacity: 30, refillPerMs: 8 / 1000 }, // 8/s
}

// Map<sourceName, {tokens:number, lastRefillMs:number}>
const _state = new Map()

function _now() {
  return Date.now()
}

function _ensure(source) {
  const def = BUCKETS[source]
  if (!def) throw new Error(`Unknown rateBucket source: ${source}`)
  let s = _state.get(source)
  if (!s) {
    s = { tokens: def.capacity, lastRefillMs: _now() }
    _state.set(source, s)
  }
  return { def, s }
}

function _refill({ def, s }) {
  const now = _now()
  const elapsed = Math.max(0, now - s.lastRefillMs)
  if (elapsed > 0) {
    s.tokens = Math.min(def.capacity, s.tokens + elapsed * def.refillPerMs)
    s.lastRefillMs = now
  }
}

/**
 * Try to consume one token from `source`'s bucket. Returns true if the
 * adapter MAY make its outbound request, false if the bucket is empty.
 *
 * @param {keyof typeof BUCKETS} source
 * @returns {boolean}
 */
function take(source) {
  const ctx = _ensure(source)
  _refill(ctx)
  if (ctx.s.tokens >= 1) {
    ctx.s.tokens -= 1
    return true
  }
  return false
}

/**
 * Inspect remaining tokens (for logs / tests). Refills first.
 */
function inspect(source) {
  const ctx = _ensure(source)
  _refill(ctx)
  return { source, tokens: ctx.s.tokens, capacity: ctx.def.capacity }
}

/**
 * Reset bucket state. Test-only; never call from app code.
 */
function _resetForTests() {
  _state.clear()
}

module.exports = {
  take,
  inspect,
  _resetForTests,
  BUCKETS,
}
