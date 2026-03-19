const crypto = require('node:crypto')
const prisma = require('./prisma')

// In-memory cache with TTL
let flagCache = new Map()
let cacheExpiry = 0
const CACHE_TTL_MS = 30_000 // 30 seconds

async function refreshCache() {
  const now = Date.now()
  if (now < cacheExpiry && flagCache.size > 0) return

  try {
    const flags = await prisma.featureFlag.findMany()
    const newCache = new Map()
    for (const flag of flags) {
      newCache.set(flag.name, flag)
    }
    flagCache = newCache
    cacheExpiry = now + CACHE_TTL_MS
  } catch {
    // If DB is unreachable, keep stale cache rather than crashing
    if (flagCache.size === 0) {
      flagCache = new Map()
    }
  }
}

function hashRollout(userId, flagName) {
  const hash = crypto.createHash('sha256').update(`${userId}:${flagName}`).digest()
  // Use first 4 bytes as unsigned 32-bit integer, mod 100
  return hash.readUInt32BE(0) % 100
}

function evaluateConditions(conditions, context) {
  if (!conditions || typeof conditions !== 'object') return true

  // conditions can specify: { roles: ['admin'], userIds: [1,2,3] }
  if (Array.isArray(conditions.roles) && conditions.roles.length > 0) {
    if (!context.role || !conditions.roles.includes(context.role)) {
      return false
    }
  }

  if (Array.isArray(conditions.userIds) && conditions.userIds.length > 0) {
    if (!context.userId || !conditions.userIds.includes(context.userId)) {
      return false
    }
  }

  return true
}

async function evaluateFlag(flagName, context = {}) {
  await refreshCache()

  const flag = flagCache.get(flagName)

  if (!flag) {
    return { enabled: false, reason: 'FLAG_NOT_FOUND' }
  }

  if (!flag.enabled) {
    return { enabled: false, reason: 'DISABLED' }
  }

  // Evaluate conditions if present
  if (flag.conditions && !evaluateConditions(flag.conditions, context)) {
    return { enabled: false, reason: 'CONDITION_NOT_MET' }
  }

  // Evaluate rollout percentage
  const rollout = typeof flag.rolloutPercentage === 'number' ? flag.rolloutPercentage : 100
  if (rollout < 100) {
    if (!context.userId) {
      return { enabled: false, reason: 'NO_USER_FOR_ROLLOUT' }
    }
    const bucket = hashRollout(context.userId, flagName)
    if (bucket >= rollout) {
      return { enabled: false, reason: 'ROLLOUT_EXCLUDED' }
    }
  }

  return { enabled: true, reason: 'ENABLED' }
}

// OpenFeature-compatible provider interface
const provider = {
  metadata: { name: 'studyhub-feature-flags' },
  resolveBooleanEvaluation: async (flagKey, defaultValue, context) => {
    const result = await evaluateFlag(flagKey, context)
    return { value: result.enabled, reason: result.reason }
  },
}

// Express middleware: attaches `req.flags` helper
function featureFlagMiddleware(req, res, next) {
  req.flags = {
    isEnabled: async (flagName) => {
      const ctx = { userId: req.user?.userId, role: req.user?.role }
      const result = await evaluateFlag(flagName, ctx)
      return result.enabled
    },
  }
  next()
}

module.exports = { evaluateFlag, featureFlagMiddleware, provider, refreshCache }
