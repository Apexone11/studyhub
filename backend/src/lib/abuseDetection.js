/**
 * Abuse Detection Service — automated pattern-based threat detection.
 *
 * Detects:
 *   1. Rate anomalies — burst creation of content by a single user.
 *   2. Content spam fingerprinting — near-duplicate submissions.
 *   3. Suspicious account signals — rapid actions after registration.
 *
 * All detections are fire-and-forget and create moderation cases
 * via the existing moderationEngine pipeline. No detection ever
 * blocks the request path.
 *
 * Configuration via environment:
 *   ABUSE_DETECTION_ENABLED — "true" to activate (default: true)
 *   ABUSE_RATE_WINDOW_MS    — sliding window for rate checks (default: 600000 = 10 min)
 *   ABUSE_RATE_THRESHOLD    — max actions per window before flagging (default: 15)
 *   ABUSE_DUPLICATE_WINDOW_HOURS — hours to look back for duplicate detection (default: 24)
 *   ABUSE_NEW_ACCOUNT_HOURS — "new account" window for heightened scrutiny (default: 2)
 */

const prisma = require('./prisma')
const { captureError } = require('../monitoring/sentry')
const { logModerationEvent } = require('./moderation/moderationLogger')

/* ── Configuration ──────────────────────────────────────────── */

function isEnabled() {
  const val = (process.env.ABUSE_DETECTION_ENABLED || 'true').toLowerCase()
  return val !== 'false' && val !== '0'
}

const RATE_WINDOW_MS = Number(process.env.ABUSE_RATE_WINDOW_MS) || 10 * 60 * 1000
const RATE_THRESHOLD = Number(process.env.ABUSE_RATE_THRESHOLD) || 15
const DUPLICATE_WINDOW_HOURS = Number(process.env.ABUSE_DUPLICATE_WINDOW_HOURS) || 24
const NEW_ACCOUNT_HOURS = Number(process.env.ABUSE_NEW_ACCOUNT_HOURS) || 2

/* ── In-memory sliding window counters ─────────────────────── */

/**
 * Simple sliding window rate tracker.
 * Key = `${userId}:${actionType}`, Value = array of timestamps.
 * Periodically pruned to avoid unbounded growth.
 */
const rateBuckets = new Map()

const MAX_BUCKET_SIZE = 10000
const PRUNE_INTERVAL_MS = 5 * 60 * 1000

function recordAction(userId, actionType) {
  const key = `${userId}:${actionType}`
  let timestamps = rateBuckets.get(key)
  if (!timestamps) {
    timestamps = []
    rateBuckets.set(key, timestamps)
  }
  timestamps.push(Date.now())
}

function getRecentCount(userId, actionType) {
  const key = `${userId}:${actionType}`
  const timestamps = rateBuckets.get(key)
  if (!timestamps) return 0
  const cutoff = Date.now() - RATE_WINDOW_MS
  // Filter in-place
  const recent = timestamps.filter((t) => t > cutoff)
  rateBuckets.set(key, recent)
  return recent.length
}

// Periodic cleanup of stale entries
setInterval(() => {
  if (rateBuckets.size <= MAX_BUCKET_SIZE) return
  const cutoff = Date.now() - RATE_WINDOW_MS
  for (const [key, timestamps] of rateBuckets) {
    const recent = timestamps.filter((t) => t > cutoff)
    if (recent.length === 0) {
      rateBuckets.delete(key)
    } else {
      rateBuckets.set(key, recent)
    }
  }
}, PRUNE_INTERVAL_MS).unref()

/* ── Spam fingerprinting ───────────────────────────────────── */

/**
 * Simple content fingerprint: lowercase, strip whitespace, take first 200 chars.
 * Not cryptographic — just enough for near-duplicate detection.
 */
function fingerprint(text) {
  if (!text || typeof text !== 'string') return ''
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
}

/* ── Core detection checks ─────────────────────────────────── */

/**
 * Check #1: Rate anomaly — too many actions of same type in window.
 */
async function checkRateAnomaly(userId, actionType) {
  recordAction(userId, actionType)
  const count = getRecentCount(userId, actionType)
  if (count >= RATE_THRESHOLD) {
    return {
      triggered: true,
      signal: 'rate_anomaly',
      detail: `${count} ${actionType} actions in ${RATE_WINDOW_MS / 1000}s window (threshold: ${RATE_THRESHOLD})`,
    }
  }
  return { triggered: false }
}

/**
 * Check #2: Duplicate content — same user submitting near-identical content.
 */
async function checkDuplicateContent(userId, contentType, text) {
  if (!text || text.length < 20) return { triggered: false }

  const fp = fingerprint(text)
  const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000)

  try {
    let recentItems = []

    if (contentType === 'sheet') {
      recentItems = await prisma.studySheet.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { id: true, content: true, title: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    } else if (contentType === 'feed_post') {
      recentItems = await prisma.feedPost.findMany({
        where: { authorId: userId, createdAt: { gte: since } },
        select: { id: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    } else if (contentType === 'comment') {
      recentItems = await prisma.comment.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { id: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    }

    const duplicates = recentItems.filter((item) => {
      const itemFp = fingerprint(item.content || item.title || '')
      return itemFp === fp
    })

    if (duplicates.length >= 2) {
      return {
        triggered: true,
        signal: 'duplicate_content',
        detail: `${duplicates.length} near-identical ${contentType} submissions in ${DUPLICATE_WINDOW_HOURS}h`,
      }
    }
  } catch (err) {
    captureError(err, { source: 'abuseDetection.checkDuplicateContent', userId, contentType })
  }

  return { triggered: false }
}

/**
 * Check #3: New account burst — account created within NEW_ACCOUNT_HOURS
 * and already performing heavy write operations.
 */
async function checkNewAccountBurst(userId, actionType) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, trustLevel: true },
    })
    if (!user) return { triggered: false }

    // Only flag "new" trust-level users
    if (user.trustLevel !== 'new') return { triggered: false }

    const accountAgeMs = Date.now() - new Date(user.createdAt).getTime()
    const isNewAccount = accountAgeMs < NEW_ACCOUNT_HOURS * 60 * 60 * 1000

    if (!isNewAccount) return { triggered: false }

    // Lower threshold for new accounts
    const newAccountThreshold = Math.max(3, Math.floor(RATE_THRESHOLD / 3))
    const count = getRecentCount(userId, actionType)

    if (count >= newAccountThreshold) {
      return {
        triggered: true,
        signal: 'new_account_burst',
        detail: `New account (${Math.round(accountAgeMs / 60000)}min old) with ${count} ${actionType} actions`,
      }
    }
  } catch (err) {
    captureError(err, { source: 'abuseDetection.checkNewAccountBurst', userId })
  }

  return { triggered: false }
}

/* ── Auto-case creation ────────────────────────────────────── */

/**
 * Create a moderation case from an abuse signal.
 * Idempotent: won't create duplicate pending cases for same user+signal.
 */
async function createAbuseCase(userId, signal, detail, contentType, contentId) {
  try {
    // Prevent duplicate pending cases for same signal
    const existing = await prisma.moderationCase.findFirst({
      where: {
        userId,
        source: 'auto_abuse_detection',
        status: 'pending',
        reasonCategory: signal === 'duplicate_content' ? 'spam' : 'other',
      },
    })
    if (existing) return existing

    const modCase = await prisma.moderationCase.create({
      data: {
        contentType: contentType || 'user',
        contentId: contentId || userId,
        userId,
        status: 'pending',
        source: 'auto_abuse_detection',
        reasonCategory: signal === 'duplicate_content' ? 'spam' : 'other',
        excerpt: detail ? detail.slice(0, 500) : null,
        evidence: JSON.stringify({ signal, detail, detectedAt: new Date().toISOString() }),
      },
    })

    logModerationEvent({
      userId,
      action: 'auto_abuse_detected',
      contentType: contentType || 'user',
      contentId: contentId || userId,
      reason: detail,
      performedBy: 'system',
      metadata: { signal, caseId: modCase.id },
    })

    return modCase
  } catch (err) {
    captureError(err, { source: 'abuseDetection.createAbuseCase', userId, signal })
    return null
  }
}

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Run all abuse checks for a content creation event.
 * Fire-and-forget — never throws, never blocks.
 *
 * @param {Object} opts
 * @param {number} opts.userId - The actor's user ID
 * @param {string} opts.actionType - Type of action: 'sheet_create', 'post_create', 'comment_create', etc.
 * @param {string} [opts.contentType] - Content model type for case creation
 * @param {number} [opts.contentId] - Content ID for case creation
 * @param {string} [opts.text] - Content text for duplicate detection
 */
async function runAbuseChecks({ userId, actionType, contentType, contentId, text }) {
  if (!isEnabled()) return
  if (!userId) return

  try {
    const checks = await Promise.all([
      checkRateAnomaly(userId, actionType),
      text ? checkDuplicateContent(userId, contentType, text) : { triggered: false },
      checkNewAccountBurst(userId, actionType),
    ])

    for (const check of checks) {
      if (check.triggered) {
        await createAbuseCase(userId, check.signal, check.detail, contentType, contentId)
      }
    }
  } catch (err) {
    // Never let abuse detection break the request path
    captureError(err, { source: 'abuseDetection.runAbuseChecks', userId, actionType })
  }
}

module.exports = {
  runAbuseChecks,
  // Exported for testing
  checkRateAnomaly,
  checkDuplicateContent,
  checkNewAccountBurst,
  fingerprint,
  isEnabled,
}
