/**
 * ai.suggestions.routes.js — Phase 3 endpoints under /api/ai.
 *
 * Mounted by ai/index.js so the existing /api/ai prefix is reused
 * (no new top-level mount). Keeps the suggestion endpoints separate
 * from ai.routes.js so the security-sensitive surface (PII redaction
 * + shared-quota counter) is easy to audit on its own.
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const {
  aiSuggestionsReadLimiter,
  aiSuggestionsRefreshLimiter,
  aiSuggestionsDismissLimiter,
} = require('../../lib/rateLimiters')
const suggestions = require('./ai.suggestions.service')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

// Strip the persisted row down to the fields the client needs. No
// raw timestamps in display, no internal columns leaked.
function shapeForClient(row) {
  if (!row) return null
  return {
    id: row.id,
    text: row.text,
    ctaLabel: row.ctaLabel,
    ctaAction: row.ctaAction,
    generatedAt: row.generatedAt,
  }
}

// GET /api/ai/suggestions
// Returns the user's current suggestion, regenerating when stale or
// missing (subject to the shared daily quota).
router.get('/', requireAuth, aiSuggestionsReadLimiter, async (req, res) => {
  try {
    const prisma = require('../../lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true, emailVerified: true, isStaffVerified: true },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const result = await suggestions.fetchOrGenerate(user)
    return res.json({
      suggestion: shapeForClient(result.suggestion),
      quotaExhausted: Boolean(result.quotaExhausted),
    })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'getSuggestion' } })
    return sendError(res, 500, 'Failed to load suggestion.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/ai/suggestions/refresh
// Force-regenerate. Counts against daily quota AND a 5/hour refresh
// limiter — the refresh button is the easiest UI vector for spamming
// AI calls, so the per-hour cap is independent of the daily budget.
router.post(
  '/refresh',
  requireAuth,
  requireTrustedOrigin,
  aiSuggestionsRefreshLimiter,
  async (req, res) => {
    try {
      const prisma = require('../../lib/prisma')
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true, emailVerified: true, isStaffVerified: true },
      })
      if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

      const result = await suggestions.refreshSuggestion(user)
      return res.json({
        suggestion: shapeForClient(result.suggestion),
        quotaExhausted: Boolean(result.quotaExhausted),
      })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'refreshSuggestion' } })
      return sendError(res, 500, 'Failed to refresh suggestion.', ERROR_CODES.INTERNAL)
    }
  },
)

// POST /api/ai/suggestions/:id/dismiss
// Owner check is inside the service via updateMany scoped on userId.
// We return 404 on owner mismatch / missing row to avoid letting an
// attacker probe id existence.
router.post(
  '/:id/dismiss',
  requireAuth,
  requireTrustedOrigin,
  aiSuggestionsDismissLimiter,
  async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10)
      if (!Number.isInteger(id) || id <= 0) {
        return sendError(res, 400, 'Invalid suggestion id.', ERROR_CODES.BAD_REQUEST)
      }
      const ok = await suggestions.dismissSuggestion(req.user.userId, id)
      if (!ok) {
        return sendError(res, 404, 'Suggestion not found.', ERROR_CODES.NOT_FOUND)
      }
      return res.json({ ok: true })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'dismissSuggestion' } })
      return sendError(res, 500, 'Failed to dismiss suggestion.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
