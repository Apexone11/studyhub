/**
 * scholar.routes.js — Scholar v1 + v1.5 API.
 *
 * Mounted at /api/scholar in backend/src/index.js.
 *
 * v1 endpoints (master plan §18.5):
 *   GET    /search?q=&type=&domain=&from=&to=&limit=&cursor=
 *   GET    /stats
 *   GET    /paper/:id
 *   GET    /paper/:id/citations
 *   GET    /paper/:id/references
 *   GET    /paper/:id/pdf
 *   POST   /save
 *   DELETE /save/:paperId
 *   POST   /cite
 *   POST   /ai/summarize
 *   POST   /ai/generate-sheet
 *
 * v1.5 endpoints (Week 5):
 *   GET    /annotations?paperId=
 *   POST   /annotations
 *   PATCH  /annotations/:id
 *   DELETE /annotations/:id
 *   GET    /paper/:id/discussions
 *   POST   /paper/:id/discussions
 *   DELETE /paper/:id/discussions/:threadId
 *   GET    /topic/:slug?sort=&yearFrom=&yearTo=&openAccess=
 *
 * All routes require auth. Writes additionally apply originAllowlist.
 * Per-route rate limiters live in lib/rateLimiters.js.
 */

const express = require('express')
const log = require('../../lib/logger')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { cacheControl } = require('../../lib/cacheControl')
const {
  scholarSearchLimiter,
  scholarReadLimiter,
  scholarSaveLimiter,
  scholarCiteLimiter,
  scholarAiSummarizeLimiter,
  scholarAiSheetLimiter,
  scholarAnnotationLimiter,
  scholarDiscussionLimiter,
} = require('../../lib/rateLimiters')

const searchController = require('./scholar.search.controller')
const paperController = require('./scholar.paper.controller')
const saveController = require('./scholar.save.controller')
const citeController = require('./scholar.cite.controller')
const annotationController = require('./scholar.annotation.controller')
const discussionController = require('./scholar.discussion.controller')
const topicController = require('./scholar.topic.controller')
const service = require('./scholar.service')
const { CANONICAL_ID_RE } = require('./scholar.constants')

const { requireFeatureFlag } = require('../../middleware/featureFlagGate')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

// L20-CRIT-2: fail-closed feature flag. Missing row OR enabled:false
// returns 503 on every Scholar endpoint without code redeploy.
router.use(requireFeatureFlag('flag_scholar_enabled'))

// All routes require auth.
router.use(requireAuth)

// ── Search ──────────────────────────────────────────────────────────────
router.get('/search', scholarSearchLimiter, searchController.search)

// ── Paper detail / citations / references / pdf ─────────────────────────
router.get(
  '/paper/:id',
  scholarReadLimiter,
  cacheControl(300, { staleWhileRevalidate: 3600 }),
  paperController.getPaper,
)
router.get(
  '/paper/:id/citations',
  scholarReadLimiter,
  cacheControl(300, { staleWhileRevalidate: 3600 }),
  paperController.getCitations,
)
router.get(
  '/paper/:id/references',
  scholarReadLimiter,
  cacheControl(300, { staleWhileRevalidate: 3600 }),
  paperController.getReferences,
)
router.get('/paper/:id/pdf', scholarReadLimiter, paperController.getPdf)

// ── Save / unsave ───────────────────────────────────────────────────────
router.post('/save', requireTrustedOrigin, scholarSaveLimiter, saveController.savePaper)
router.delete(
  '/save/:paperId',
  requireTrustedOrigin,
  scholarSaveLimiter,
  saveController.unsavePaper,
)

// ── Cite ────────────────────────────────────────────────────────────────
router.post('/cite', requireTrustedOrigin, scholarCiteLimiter, citeController.citePaper)

// ── AI deep-link endpoints ─────────────────────────────────────────────
// These do NOT call the AI service directly — they return the structured
// paper context + a suggested prompt that the frontend forwards to
// /api/ai/messages. This keeps the AI module untouched and lets the AI
// module's own rate limit + quota gating apply at the actual AI call.

const SUMMARIZE_PROMPT_TEMPLATE = (title) =>
  `Summarize the paper "${title}" in plain language for a college student. ` +
  'Include: 1) the research question, 2) the methodology in 2 sentences, ' +
  '3) the main finding, 4) limitations. Cite the paper using [[CITE]] markers.'

const SHEET_PROMPT_TEMPLATE = (title, extra) =>
  `Generate a study sheet for the paper "${title}". ` +
  (extra ? `User instructions: ${extra}. ` : '') +
  'Use the existing study-sheet HTML format. Keep it under 6 sections. ' +
  'Cite the paper using [[CITE]] markers where appropriate.'

router.post('/ai/summarize', requireTrustedOrigin, scholarAiSummarizeLimiter, async (req, res) => {
  try {
    const { paperId } = req.body || {}
    if (typeof paperId !== 'string' || !CANONICAL_ID_RE.test(paperId)) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    const paper = await service.getPaperDetail(paperId)
    if (!paper) return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)
    const context = {
      paperId,
      title: paper.title,
      authors: paper.authors || [],
      venue: paper.venue,
      publishedAt: paper.publishedAt,
      doi: paper.doi,
      abstract: paper.abstract,
    }
    res.json({
      context,
      suggestedPrompt: SUMMARIZE_PROMPT_TEMPLATE(paper.title || 'this paper'),
      // Quota cost reported to the client. Real enforcement happens
      // when the client posts the prompt to /api/ai/messages.
      quotaCostMessages: 1,
    })
  } catch (err) {
    log.error({ err, event: 'scholar.ai.summarize.failed' }, 'Scholar AI summarize failed')
    return sendError(res, 500, 'Failed to prepare summary prompt.', ERROR_CODES.INTERNAL)
  }
})

router.post('/ai/generate-sheet', requireTrustedOrigin, scholarAiSheetLimiter, async (req, res) => {
  try {
    const { paperId, prompt } = req.body || {}
    if (typeof paperId !== 'string' || !CANONICAL_ID_RE.test(paperId)) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    const extra =
      typeof prompt === 'string' && prompt.trim().length > 0 ? prompt.trim().slice(0, 500) : null
    const paper = await service.getPaperDetail(paperId)
    if (!paper) return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)
    const context = {
      paperId,
      title: paper.title,
      authors: paper.authors || [],
      venue: paper.venue,
      publishedAt: paper.publishedAt,
      doi: paper.doi,
      abstract: paper.abstract,
    }
    res.json({
      context,
      suggestedPrompt: SHEET_PROMPT_TEMPLATE(paper.title || 'this paper', extra),
      // Sheet generation counts as 5 messages (plan §18.7 / L5-MED-6).
      quotaCostMessages: 5,
    })
  } catch (err) {
    log.error({ err, event: 'scholar.ai.sheet.failed' }, 'Scholar AI sheet failed')
    return sendError(res, 500, 'Failed to prepare sheet prompt.', ERROR_CODES.INTERNAL)
  }
})

// ── Stats (Week 5) ──────────────────────────────────────────────────────
// Lightweight platform stats for the /scholar landing hero strip.
// Cached for 5 minutes (sw 1 hour). The page degrades gracefully
// when stats are 0 — no flicker, no error UI.
router.get(
  '/stats',
  scholarReadLimiter,
  cacheControl(300, { staleWhileRevalidate: 3600 }),
  topicController.getStats,
)

// ── Topic feed (Week 5) ─────────────────────────────────────────────────
router.get(
  '/topic/:slug',
  scholarReadLimiter,
  cacheControl(60, { staleWhileRevalidate: 600 }),
  topicController.getTopicFeed,
)

// ── Annotations (Week 5, v1.5) ──────────────────────────────────────────
router.get('/annotations', scholarReadLimiter, annotationController.listAnnotations)
router.post(
  '/annotations',
  requireTrustedOrigin,
  scholarAnnotationLimiter,
  annotationController.createAnnotation,
)
router.patch(
  '/annotations/:id',
  requireTrustedOrigin,
  scholarAnnotationLimiter,
  annotationController.updateAnnotation,
)
router.delete(
  '/annotations/:id',
  requireTrustedOrigin,
  scholarAnnotationLimiter,
  annotationController.deleteAnnotation,
)

// ── Discussions (Week 5, v1.5) ──────────────────────────────────────────
router.get('/paper/:id/discussions', scholarReadLimiter, discussionController.listDiscussions)
router.post(
  '/paper/:id/discussions',
  requireTrustedOrigin,
  scholarDiscussionLimiter,
  discussionController.createDiscussion,
)
router.delete(
  '/paper/:id/discussions/:threadId',
  requireTrustedOrigin,
  scholarDiscussionLimiter,
  discussionController.deleteDiscussion,
)

module.exports = router
