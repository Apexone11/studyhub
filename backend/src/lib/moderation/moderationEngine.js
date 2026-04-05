/* ═══════════════════════════════════════════════════════════════════════════
 * moderationEngine.js — Core moderation runtime for StudyHub
 *
 * Provides async content scanning via Claude Haiku, strike management,
 * restriction enforcement, and case review utilities.
 *
 * Design:
 *   - scanContent() is FIRE-AND-FORGET (never blocks content creation)
 *   - Confidence routing: ≥0.85 high, 0.5–0.84 medium, <0.5 clean
 *   - Strike model: 90-day decay, 4 active strikes = auto-restrict
 *   - All errors are captured via Sentry, never re-thrown to callers
 *
 * Feature flag: ANTHROPIC_API_KEY presence enables scanning. No key = no scan.
 * ═══════════════════════════════════════════════════════════════════════════ */
const Anthropic = require('@anthropic-ai/sdk')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../prisma')
const { createNotification } = require('../notify')
const { logModerationEvent } = require('./moderationLogger')

/* ── Lazy-initialised Anthropic client ─────────────────────────────────── */
let _anthropic = null
function getAnthropicClient() {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
    _anthropic = new Anthropic.default({ apiKey })
  }
  return _anthropic
}

/* ── Feature flag ────────────────────────────────────────────────────────── */

/**
 * Returns true if the Anthropic API is configured for moderation.
 * When false, all scanning is silently skipped.
 */
function isModerationEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/* ── Claude moderation system prompt ─────────────────────────────────────── */

const MODERATION_MODEL = 'claude-haiku-4-5-20251001'

const MODERATION_SYSTEM_PROMPT = `You are a content moderation system for StudyHub, a college study platform. Evaluate the following text for policy violations.

Evaluate these categories (score each 0.0 to 1.0):
- hate: Content that expresses hatred toward a group based on protected characteristics
- harassment: Content that targets, threatens, or intimidates an individual
- self_harm: Content that promotes or glorifies self-harm or suicide
- sexual: Sexually explicit content
- violence: Content that depicts or promotes violence
- academic_dishonesty: Content that facilitates cheating, plagiarism, or exam fraud

RESPONSE FORMAT (JSON only, no other text):
{
  "flagged": true/false,
  "categories": {
    "hate": 0.0,
    "harassment": 0.0,
    "self_harm": 0.0,
    "sexual": 0.0,
    "violence": 0.0,
    "academic_dishonesty": 0.0
  },
  "top_category": "string or null",
  "top_score": 0.0,
  "reasoning": "brief explanation"
}

Set flagged to true if ANY category scores above 0.5.
Be calibrated: educational content about sensitive topics (e.g., a nursing student studying trauma, a history student studying war crimes) should NOT be flagged. Only flag content that is itself harmful, not content that discusses harmful topics academically.`

/* ── Claude Moderation API call ──────────────────────────────────────────── */

/**
 * Calls Claude Haiku for content moderation and returns the parsed result.
 * Returns null on any error so callers can safely skip case creation.
 */
async function callClaudeModeration(text) {
  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: MODERATION_MODEL,
      max_tokens: 512,
      system: MODERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Text to moderate:\n\n${text}` }],
    })

    const rawText = response.content[0]?.text || ''
    const cleaned = rawText.replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '').trim()
    const result = JSON.parse(cleaned)

    // Map Claude response to the same format as before
    const categories = result.categories || {}
    const categoryScores = {}
    const categoryFlags = {}
    for (const [cat, score] of Object.entries(categories)) {
      categoryScores[cat] = score
      categoryFlags[cat] = score >= 0.5
    }

    return {
      flagged: result.flagged || false,
      categories: categoryFlags,
      categoryScores,
      topCategory: result.top_category || null,
      topScore: result.top_score || 0,
    }
  } catch (error) {
    captureError(error, { context: 'claude-moderation' })
    return null
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

    const modResult = await callClaudeModeration(text.slice(0, 10000))
    if (!modResult) return

    /* Use top category/score from Claude response */
    const scores = modResult.categoryScores || {}
    let topCategory = modResult.topCategory
    let topScore = modResult.topScore || 0

    // Fallback: find highest-scoring category from scores if not provided
    if (!topCategory) {
      for (const [category, score] of Object.entries(scores)) {
        if (score > topScore) {
          topScore = score
          topCategory = category
        }
      }
    }

    /* Route based on confidence threshold */
    if (topScore < 0.5) return // clean — no case needed

    /* Build flagged categories list for evidence */
    const flaggedCategories = Object.entries(scores)
      .filter(([, score]) => score >= 0.5)
      .map(([cat, score]) => ({ category: cat, score: Math.round(score * 1000) / 1000 }))

    /* Create moderation case */
    const modCase = await prisma.moderationCase.create({
      data: {
        contentType,
        contentId,
        userId,
        status: 'pending',
        confidence: Math.round(topScore * 1000) / 1000,
        category: topCategory,
        provider: 'claude',
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

    logModerationEvent({ userId: modCase.userId, action: 'case_opened', caseId: modCase.id, contentType, contentId, reason: `Auto-detected: ${topCategory}` })

    /* Hide flagged content from public until admin review */
    try {
      if (HAS_MODERATION_STATUS.has(contentType)) {
        const modelName = CONTENT_MODEL_MAP[contentType]
        if (modelName && prisma[modelName]) {
          await prisma[modelName].update({
            where: { id: contentId },
            data: { moderationStatus: 'pending_review' },
          })
        }
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

  logModerationEvent({ userId, action: 'strike_issued', caseId, strikeId: strike.id, reason, performedBy: null })

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
    if (restricted) {
      logModerationEvent({ userId, action: 'restriction_applied', reason: `Auto-restricted: ${activeStrikes} active strikes`, performedBy: null })
    }
  }

  /* Notify the user about the strike */
  try {
    await createNotification(prisma, {
      userId,
      type: 'moderation',
      message: `You received a strike: ${reason}`,
      actorId: null,
      linkPath: '/settings?tab=moderation',
      priority: 'high',
    })
  } catch { /* notification failures are non-fatal */ }

  /* If auto-restriction was triggered, send a separate high-priority notification */
  if (restricted) {
    try {
      await createNotification(prisma, {
        userId,
        type: 'moderation',
        message: `Your account has been restricted due to ${activeStrikes} active strikes. Posting, sharing, and publishing are temporarily blocked.`,
        actorId: null,
        linkPath: '/settings?tab=moderation',
        priority: 'high',
      })
    } catch { /* notification failures are non-fatal */ }
  }

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

/* ── Prisma model mapping for moderation targets ─────────────────────────── */
const CONTENT_MODEL_MAP = {
  post: 'feedPost',
  feed_post: 'feedPost',
  sheet: 'studySheet',
  note: 'note',
  post_comment: 'feedPostComment',
  sheet_comment: 'comment',
  note_comment: 'noteComment',
}

/* Content types that support moderationStatus field */
const HAS_MODERATION_STATUS = new Set([
  'note', 'note_comment', 'post', 'feed_post', 'post_comment', 'sheet_comment',
])

/* ── Case review ─────────────────────────────────────────────────────────── */

/**
 * Admin action: dismiss or confirm a moderation case.
 * Confirm = takedown: snapshot content, mark as confirmed_violation.
 * Dismiss = restore: set moderationStatus back to 'clean'.
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

  if (action === 'confirm') {
    logModerationEvent({ userId: modCase.userId, action: 'case_confirmed', caseId, contentType: modCase.contentType, contentId: modCase.contentId, performedBy: reviewedBy })
  } else {
    logModerationEvent({ userId: modCase.userId, action: 'case_dismissed', caseId, performedBy: reviewedBy })
  }

  const { contentType, contentId } = modCase

  /* Sync moderationStatus on target content */
  try {
    const nextModStatus = action === 'dismiss' ? 'clean' : 'confirmed_violation'

    if (HAS_MODERATION_STATUS.has(contentType)) {
      const modelName = CONTENT_MODEL_MAP[contentType]
      if (modelName && prisma[modelName]) {
        await prisma[modelName].update({
          where: { id: contentId },
          data: { moderationStatus: nextModStatus },
        })
      }
    }

    /* For sheets: confirmed → mark status as 'removed_by_moderation' */
    if (contentType === 'sheet') {
      await prisma.studySheet.update({
        where: { id: contentId },
        data: { status: action === 'dismiss' ? 'published' : 'removed_by_moderation' },
      }).catch(() => { /* sheet may not exist */ })
    }

    /* On confirm: create a snapshot for potential restore on appeal */
    if (action === 'confirm') {
      await createSnapshot(modCase)
    }
  } catch (err) {
    captureError(err, { context: 'moderation-review-sync', contentType, contentId })
  }

  return modCase
}

/**
 * Create a snapshot of the target content before takedown.
 * This enables restore on appeal approval.
 */
async function createSnapshot(modCase) {
  const { id: caseId, contentType, contentId, userId } = modCase
  const modelName = CONTENT_MODEL_MAP[contentType]
  if (!modelName || !prisma[modelName]) return

  try {
    const record = await prisma[modelName].findUnique({ where: { id: contentId } })
    if (!record) return

    await prisma.moderationSnapshot.create({
      data: {
        caseId,
        targetType: contentType,
        targetId: contentId,
        ownerId: userId || record.userId || null,
        contentJson: record,
        attachmentUrl: record.attachmentUrl || null,
      },
    })
  } catch (err) {
    captureError(err, { context: 'moderation-snapshot-create', contentType, contentId })
  }
}

/**
 * Restore content that was taken down by moderation.
 * Called when an appeal is approved.
 *
 * @param {number} caseId — the ModerationCase to reverse
 * @returns {{ success: boolean, error?: string }}
 */
async function restoreContent(caseId) {
  try {
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, contentType: true, contentId: true, status: true, userId: true },
    })
    if (!modCase) {
      console.error(`[restoreContent] Case not found: caseId=${caseId}`)
      return { success: false, error: 'Case not found' }
    }

    const { contentType, contentId } = modCase
    const modelName = CONTENT_MODEL_MAP[contentType]

    if (!modelName) {
      console.error(`[restoreContent] Unknown content type: caseId=${caseId}, contentType=${contentType}`)
      return { success: false, error: 'Unknown content type' }
    }

    /* Wrap all restoration updates in a transaction so partial failures roll back */
    await prisma.$transaction(async (tx) => {
      /* Restore moderationStatus to clean */
      if (HAS_MODERATION_STATUS.has(contentType) && modelName && tx[modelName]) {
        await tx[modelName].update({
          where: { id: contentId },
          data: { moderationStatus: 'clean' },
        })
      }

      /* For sheets: restore to published */
      if (contentType === 'sheet') {
        await tx.studySheet.update({
          where: { id: contentId },
          data: { status: 'published' },
        })
      }

      /* Mark snapshot as restored */
      await tx.moderationSnapshot.updateMany({
        where: { caseId, restoredAt: null },
        data: { restoredAt: new Date() },
      })

      /* Update case status to reflect reversal */
      await tx.moderationCase.update({
        where: { id: caseId },
        data: { status: 'reversed' },
      })
    })

    logModerationEvent({ userId: modCase.userId, action: 'appeal_approved', caseId })
    return { success: true }
  } catch (err) {
    console.error(`[restoreContent] Restore failed: caseId=${caseId}`, err)
    captureError(err, { context: 'moderation-restore', caseId })
    return { success: false, error: err.message }
  }
}

/* ── Exports ─────────────────────────────────────────────────────────────── */

module.exports = {
  isModerationEnabled,
  scanContent,
  countActiveStrikes,
  issueStrike,
  hasActiveRestriction,
  reviewCase,
  restoreContent,
}
