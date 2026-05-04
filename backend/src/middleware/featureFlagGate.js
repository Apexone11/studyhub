/**
 * featureFlagGate.js — fail-closed middleware that gates a route on a
 * FeatureFlag row.
 *
 * Per CLAUDE.md §12 + decision #20: every signal except an explicit
 * `enabled: true` row treats the flag as DISABLED.
 *
 *   - Row missing → disabled
 *   - DB error    → disabled
 *   - `enabled: false` → disabled
 *   - `enabled: true`  → enabled
 *
 * Usage:
 *   router.use(requireFeatureFlag('flag_hub_ai_attachments'))
 *
 * Cache TTL is 30s — short enough for an operator-flip to take effect
 * within a minute, long enough to avoid hammering Postgres on every
 * request. Keep the TTL small; this is the kill switch path.
 */
const { sendError, ERROR_CODES } = require('./errorEnvelope')
const log = require('../lib/logger')

const CACHE_TTL_MS = 30 * 1000
const cache = new Map()

let prismaPromise = null
function getPrisma() {
  if (!prismaPromise) {
    prismaPromise = Promise.resolve().then(() => require('../lib/prisma'))
  }
  return prismaPromise
}

async function readFlag(name) {
  const cached = cache.get(name)
  const now = Date.now()
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.enabled
  let enabled = false
  try {
    const prisma = await getPrisma()
    const row = await prisma.featureFlag.findUnique({
      where: { name },
      select: { enabled: true },
    })
    enabled = row?.enabled === true
  } catch (err) {
    enabled = false
    log.warn(
      { event: 'feature_flag.read_failed', flag: name, err: err.message },
      'Feature flag lookup failed (fail-closed)',
    )
  }
  cache.set(name, { enabled, cachedAt: now })
  return enabled
}

function requireFeatureFlag(name) {
  return async function featureFlagGate(req, res, next) {
    const enabled = await readFlag(name)
    if (!enabled) {
      return sendError(
        res,
        503,
        'This feature is temporarily unavailable.',
        ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE',
      )
    }
    return next()
  }
}

// Test hook only — prod code never imports this.
function _clearCache() {
  cache.clear()
}

module.exports = { requireFeatureFlag, _clearCache }
