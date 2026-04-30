/**
 * ai.routes.js -- Hub AI assistant API routes.
 *
 * Endpoints:
 * - GET    /api/ai/conversations          List conversations (paginated)
 * - POST   /api/ai/conversations          Create a new conversation
 * - GET    /api/ai/conversations/:id      Get conversation with messages
 * - DELETE /api/ai/conversations/:id      Delete a conversation
 * - PATCH  /api/ai/conversations/:id      Rename a conversation
 * - POST   /api/ai/messages               Send message + stream AI response (SSE)
 * - GET    /api/ai/usage                  Get daily usage stats
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { readLimiter, writeLimiter, createAiMessageLimiter } = require('../../lib/rateLimiters')
const aiService = require('./ai.service')
const {
  MAX_MESSAGE_LENGTH,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_SIZE,
  ALLOWED_IMAGE_TYPES,
  AI_RATE_LIMIT_RPM,
} = require('./ai.constants')

const router = express.Router()

// Per-user rate limit for AI message sending (stricter than general API).
// Uses AI_RATE_LIMIT_RPM from ai.constants for the max value.
const aiMessageLimiter = createAiMessageLimiter(AI_RATE_LIMIT_RPM)

// ── Conversation CRUD ──────────────────────────────────────────────

// GET /api/ai/conversations
router.get('/conversations', requireAuth, readLimiter, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100)
    const offset = parseInt(req.query.offset) || 0
    const result = await aiService.listConversations(req.user.userId, { limit, offset })
    res.json(result)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'listConversations' } })
    res.status(500).json({ error: 'Failed to load conversations.' })
  }
})

// POST /api/ai/conversations
router.post('/conversations', requireAuth, writeLimiter, async (req, res) => {
  try {
    const conversation = await aiService.createConversation(req.user.userId, req.body.title || null)
    res.status(201).json(conversation)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'createConversation' } })
    res.status(500).json({ error: 'Failed to create conversation.' })
  }
})

// GET /api/ai/conversations/:id
router.get('/conversations/:id', requireAuth, readLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid conversation ID.' })

    const conversation = await aiService.getConversation(id, req.user.userId)
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })

    res.json(conversation)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'getConversation' } })
    res.status(500).json({ error: 'Failed to load conversation.' })
  }
})

// DELETE /api/ai/conversations/:id
router.delete('/conversations/:id', requireAuth, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid conversation ID.' })

    const deleted = await aiService.deleteConversation(id, req.user.userId)
    if (!deleted) return res.status(404).json({ error: 'Conversation not found.' })

    res.json({ message: 'Conversation deleted.' })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'deleteConversation' } })
    res.status(500).json({ error: 'Failed to delete conversation.' })
  }
})

// PATCH /api/ai/conversations/:id
router.patch('/conversations/:id', requireAuth, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid conversation ID.' })

    const { title } = req.body
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required.' })
    }

    const updated = await aiService.renameConversation(
      id,
      req.user.userId,
      title.trim().slice(0, 200),
    )
    if (!updated) return res.status(404).json({ error: 'Conversation not found.' })

    res.json(updated)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'renameConversation' } })
    res.status(500).json({ error: 'Failed to rename conversation.' })
  }
})

// ── Send message (SSE streaming response) ──────────────────────────

// POST /api/ai/messages
router.post('/messages', requireAuth, aiMessageLimiter, async (req, res) => {
  try {
    const { conversationId, content, currentPage, images } = req.body

    // Validate required fields.
    if (!conversationId || typeof conversationId !== 'number') {
      return res.status(400).json({ error: 'conversationId is required.' })
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required.' })
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return res
        .status(400)
        .json({ error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` })
    }

    // Validate images if provided.
    if (images) {
      if (!Array.isArray(images) || images.length > MAX_IMAGES_PER_MESSAGE) {
        return res
          .status(400)
          .json({ error: `Maximum ${MAX_IMAGES_PER_MESSAGE} images per message.` })
      }
      for (const img of images) {
        if (!img.base64 || !img.mediaType) {
          return res.status(400).json({ error: 'Each image must have base64 and mediaType.' })
        }
        if (!ALLOWED_IMAGE_TYPES.includes(img.mediaType)) {
          return res.status(400).json({ error: `Unsupported image type: ${img.mediaType}` })
        }
        // Rough size check (base64 is ~33% larger than raw).
        const approxSize = (img.base64.length * 3) / 4
        if (approxSize > MAX_IMAGE_SIZE) {
          return res.status(400).json({ error: 'Image exceeds 5 MB size limit.' })
        }
      }
    }

    // Set SSE headers. `flushHeaders()` pushes them to the wire immediately
    // so the bubble's "Thinking…" indicator can render even if Claude takes
    // a few seconds before the first delta. The compression middleware is
    // already configured to skip text/event-stream content types — see
    // backend/src/index.js — so writes are not buffered behind gzip.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    // SSE comment frame: forces the client to leave its initial buffer and
    // keeps long-lived connections warm against intermediate proxies.
    res.write(': open\n\n')

    // Track client disconnects so we can abort Claude mid-stream
    // and avoid wasting tokens / persisting orphaned messages.
    const abortController = new AbortController()
    req.on('close', () => abortController.abort())

    // Fetch full user record for rate-limit evaluation.
    const prisma = require('../../lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true, emailVerified: true, isStaffVerified: true },
    })

    if (!user) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'User not found.' })}\n\n`)
      res.end()
      return
    }

    // Stream the response.
    await aiService.streamMessage({
      user,
      conversationId,
      content: content.trim(),
      currentPage: currentPage || null,
      images: images || null,
      res,
      signal: abortController.signal,
    })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'streamMessage' } })
    // If headers haven't been sent yet, send JSON error.
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service error.' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Unexpected error.' })}\n\n`)
      res.end()
    }
  }
})

// ── Usage stats ────────────────────────────────────────────────────

// GET /api/ai/usage — returns both daily and weekly quota snapshot
router.get('/usage', requireAuth, readLimiter, async (req, res) => {
  try {
    const prisma = require('../../lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true, emailVerified: true, isStaffVerified: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    // Phase 1: return the full quota snapshot (daily + weekly)
    const quota = await aiService.getUsageQuota(user)

    // Also include the legacy flat fields for backward compatibility
    // with the existing AiBubble usage display.
    const stats = await aiService.getUsageStats(user)

    res.json({ ...stats, ...quota })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'getUsage' } })
    res.status(500).json({ error: 'Failed to load usage stats.' })
  }
})

/**
 * POST /api/ai/messages/:id/flag
 *
 * User-facing report flow for assistant messages. Lets a user flag a
 * specific AI response for admin review. Industry-standard ("report
 * this response" pattern from Anthropic console, ChatGPT, Gemini).
 *
 * Body: { reason: 'harmful' | 'inaccurate' | 'biased' | 'illegal' | 'other', note?: string }
 *
 * Idempotent on the (messageId, flaggedById) tuple: re-flagging the
 * same message updates `flaggedReason` + `flaggedNote` rather than
 * creating duplicate rows.
 */
const ALLOWED_FLAG_REASONS = new Set(['harmful', 'inaccurate', 'biased', 'illegal', 'other'])

router.post('/messages/:id/flag', requireAuth, writeLimiter, async (req, res) => {
  try {
    const prisma = require('../../lib/prisma')
    const messageId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Invalid message id.' })
    }
    const reason = String(req.body?.reason || '')
      .trim()
      .toLowerCase()
    if (!ALLOWED_FLAG_REASONS.has(reason)) {
      return res.status(400).json({ error: 'Invalid reason.' })
    }
    const note =
      String(req.body?.note || '')
        .trim()
        .slice(0, 1000) || null

    const message = await prisma.aiMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        role: true,
        conversation: { select: { userId: true } },
      },
    })
    if (!message) return res.status(404).json({ error: 'Message not found.' })
    // Only the conversation owner can flag — assistant messages only
    // (no point flagging your own user input).
    if (message.conversation.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only flag your own AI conversations.' })
    }
    if (message.role !== 'assistant') {
      return res.status(400).json({ error: 'Only assistant messages can be flagged.' })
    }

    await prisma.aiMessage.update({
      where: { id: messageId },
      data: {
        flaggedAt: new Date(),
        flaggedReason: reason,
        flaggedById: req.user.userId,
        flaggedNote: note,
      },
    })

    res.json({ ok: true })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'flagMessage' } })
    res.status(500).json({ error: 'Failed to flag message.' })
  }
})

module.exports = router
