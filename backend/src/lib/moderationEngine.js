/* ═══════════════════════════════════════════════════════════════════════════
 * moderationEngine.js — Core moderation runtime for StudyHub
 *
 * Provides async content scanning via OpenAI Moderation API, strike
 * management, restriction enforcement, and case review utilities.
 *
 * Design:
 *   - scanContent() is FIRE-AND-FORGET (never blocks content creation)
 *   - Confidence routing: ≥0.85 high, 0.5–0.84 medium, <0.5 clean
 *   - Strike model: 90-day decay, 4 active strikes = auto-restrict
 *   - All errors are captured via Sentry, never re-thrown to callers
 *
 * Feature flag: OPENAI_API_KEY presence enables scanning. No key = no scan.
 * ═══════════════════════════════════════════════════════════════════════════ */
const OpenAI = require('openai')
const { captureError } = require('../monitoring/sentry')
const prisma = require('./prisma')
const { createNotification } = require('./notify')

/* ── Lazy-initialised OpenAI client ──────────────────────────────────────── */
let _openai = null
function getOpenAiClient() {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

/* ── Feature flag ────────────────────────────────────────────────────────── */

/**
 * Returns true if the OpenAI Moderation API is configured.
 * When false, all scanning is silently skipped.
 */
function isModerationEnabled() {
  return Boolean(process.env.OPENAI_API_KEY)
}

/* ── OpenAI Moderation API call ──────────────────────────────────────────── */

/**
 * Calls the OpenAI Moderation endpoint and returns the parsed result.
 * Returns null on any error (network, rate limit, invalid key, etc.)
 * so callers can safely skip case creation.
 */
const MODERATION_TIMEOUT_MS = 10_000

async function callOpenAiModeration(text) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS)
  try {
    const client = getOpenAiClient()
    const response = await client.moderations.create(
      {
        model: process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest',
        input: text,
      },
      { signal: controller.signal },
    )
    const result = response.results?.[0]
    if (!result) return null
    return {
      flagged: result.flagged,
      categories: result.categories,
      categoryScores: result.category_scores,
    }
  } catch (error) {
    captureError(error, { context: 'openai-moderation', timedOut: error.name === 'AbortError' })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/* ── Content scanning (fire-and-forget) ──────────────────────────────────── */

/**
 * Scans text content via OpenAI Moderation API and creates a ModerationCase
 * if the confidence score meets the threshold (≥ 0.5).
 *
 * IMPORTANT: This function is designed to be called with `void scanContent()`
 * — it NEVER throws and NEVER blocks the caller's response.
 *
 * @param {object} params
 * @param {'feed_post'|'feed_comment'|'sheet'|'note'|'note_comment'} params.contentType
 * @param {number} params.contentId — DB record ID of the content
 * @param {string} params.text — text to scan
 * @param {number} params.userId — author's user ID
 */
async function scanContent({ contentType, contentId, text, userId }) {
  try {
    /* Skip empty or very short content (noise) */
    if (!text || text.trim().length < 5) return

    const modResult = await callOpenAiModeration(text.slice(0, 10000))
    if (!modResult) return

    /* Find the highest-scoring category */
    const scores = modResult.categoryScores || {}
    let topCategory = null
    let topScore = 0

    for (const [category, score] of Object.entries(scores)) {
      if (score > topScore) {
        topScore = score
        topCategory = category
      }
    }

    /* Route based on confidence threshold */
    if (topScore < 0.5) return // clean — no case needed

    /* Build flagged categories list for evidence */
    const flaggedCategories = Object.entries(scores)
      .filter(([, score]) => score >= 0.5)
      .map(([cat, score]) => ({ category: cat, score: Math.round(score * 1000) / 1000 }))

    /* Create moderation case */
    await prisma.moderationCase.create({
      data: {
        contentType,
        contentId,
        userId,
        status: 'pending',
        confidence: Math.round(topScore * 1000) / 1000,
        category: topCategory,
        provider: 'openai',
        source: 'auto',
        reasonCategory: topCategory,
        excerpt: text.slice(0, 400),
        evidence: {
          flagged: modResult.flagged,
          topScore: Math.round(topScore * 1000) / 1000,
          flaggedCategories,
          textPreview: text.slice(0, 200),
        },
      },
    })

    /* Hide flagged notes/comments from public until admin review */
    try {
      if (contentType === 'note') {
        await prisma.note.update({
          where: { id: contentId },
          data: { moderationStatus: 'pending_review' },
        })
      } else if (contentType === 'note_comment') {
        await prisma.noteComment.update({
          where: { id: contentId },
          data: { moderationStatus: 'pending_review' },
        })
      }
    } catch (hideErr) {
      captureError(hideErr, { context: 'moderation-hide', contentType, contentId })
    }
  } catch (error) {
    /* Never let scanning errors propagate — content is already published */
    captureError(error, { context: 'moderation-scan', contentType, contentId })
  }
}

/* ── Strike management ───────────────────────────────────────────────────── */

/** Count active (non-decayed, non-expired) strikes for a user. */
async function countActiveStrikes(userId) {
  return prisma.strike.count({
    where: {
      userId,
      decayedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
}

/**
 * Issue a strike to a user. Auto-restricts if the user reaches 4+ active strikes.
 *
 * @param {object} params
 * @param {number} params.userId — target user
 * @param {string} params.reason — human-readable reason
 * @param {number|null} params.caseId — optional linked ModerationCase
 * @returns {object} { strike, activeStrikes, restricted }
 */
async function issueStrike({ userId, reason, caseId }) {
  const STRIKE_DURATION_DAYS = 90
  const AUTO_RESTRICT_THRESHOLD = 4

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + STRIKE_DURATION_DAYS)

  const strike = await prisma.strike.create({
    data: {
      userId,
      reason,
      caseId: caseId || null,
      expiresAt,
    },
  })

  const activeStrikes = await countActiveStrikes(userId)
  let restricted = false

  /* Auto-restrict at threshold. Use a transaction to avoid a race where
   * two concurrent strikes both see "no restriction" and create duplicates. */
  if (activeStrikes >= AUTO_RESTRICT_THRESHOLD) {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.userRestriction.findFirst({
        where: {
          userId,
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: { id: true },
      })
      if (existing) return null
      return tx.userRestriction.create({
        data: {
          userId,
          type: 'full',
          reason: `Auto-restricted: ${activeStrikes} active strikes (threshold: ${AUTO_RESTRICT_THRESHOLD}).`,
        },
      })
    })
    restricted = !!created
  }

  /* Notify the user about the strike */
  try {
    await createNotification(prisma, {
      userId,
      type: 'moderation',
      message: `You received a strike: ${reason}`,
      actorId: null,
      linkPath: '/settings?tab=account',
    })
  } catch { /* notification failures are non-fatal */ }

  return { strike, activeStrikes, restricted }
}

/** Check if a user has any active restriction (not expired, not lifted). */
async function hasActiveRestriction(userId) {
  const count = await prisma.userRestriction.count({
    where: {
      userId,
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
  })
  return count > 0
}

/* ── Case review ─────────────────────────────────────────────────────────── */

/**
 * Admin action: dismiss or confirm a moderation case.
 *
 * @param {object} params
 * @param {number} params.caseId
 * @param {number} params.reviewedBy — admin userId
 * @param {'dismiss'|'confirm'} params.action
 * @param {string} [params.reviewNote]
 * @returns {object} updated ModerationCase
 */
async function reviewCase({ caseId, reviewedBy, action, reviewNote }) {
  const nextStatus = action === 'dismiss' ? 'dismissed' : 'confirmed'

  const modCase = await prisma.moderationCase.update({
    where: { id: caseId },
    data: {
      status: nextStatus,
      reviewedBy,
      reviewNote: reviewNote || null,
    },
  })

  /* Sync moderationStatus on notes/comments when case is reviewed.
   * Dismiss → restore to 'clean' (false positive).
   * Confirm → mark 'confirmed_violation' (stays hidden permanently). */
  try {
    const { contentType, contentId } = modCase
    if (contentType === 'note') {
      await prisma.note.update({
        where: { id: contentId },
        data: { moderationStatus: action === 'dismiss' ? 'clean' : 'confirmed_violation' },
      })
    } else if (contentType === 'note_comment') {
      await prisma.noteComment.update({
        where: { id: contentId },
        data: { moderationStatus: action === 'dismiss' ? 'clean' : 'confirmed_violation' },
      })
    }
  } catch (err) {
    captureError(err, { context: 'moderation-review-sync', contentType: modCase.contentType, contentId: modCase.contentId })
  }

  return modCase
}

/* ── Exports ─────────────────────────────────────────────────────────────── */

module.exports = {
  isModerationEnabled,
  scanContent,
  countActiveStrikes,
  issueStrike,
  hasActiveRestriction,
  reviewCase,
}
