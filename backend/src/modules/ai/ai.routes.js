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
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { readLimiter, writeLimiter, createAiMessageLimiter } = require('../../lib/rateLimiters')

const requireTrustedOrigin = originAllowlist()
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
    // Clamp both ends — a negative `?limit=-10` or `?offset=-5` would
    // otherwise be passed straight to the service. Floor at 1 / 0 and
    // ceiling at 100 to match the per-page cap.
    const rawLimit = Number.parseInt(req.query.limit, 10) || 30
    const limit = Math.min(Math.max(rawLimit, 1), 100)
    const rawOffset = Number.parseInt(req.query.offset, 10) || 0
    const offset = Math.max(rawOffset, 0)
    const result = await aiService.listConversations(req.user.userId, { limit, offset })
    res.json(result)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'listConversations' } })
    sendError(res, 500, 'Failed to load conversations.', ERROR_CODES.INTERNAL)
  }
})

// POST /api/ai/conversations
router.post('/conversations', requireAuth, requireTrustedOrigin, writeLimiter, async (req, res) => {
  try {
    const conversation = await aiService.createConversation(req.user.userId, req.body.title || null)
    res.status(201).json(conversation)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'createConversation' } })
    sendError(res, 500, 'Failed to create conversation.', ERROR_CODES.INTERNAL)
  }
})

// GET /api/ai/conversations/:id
router.get('/conversations/:id', requireAuth, readLimiter, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'Invalid conversation ID.', ERROR_CODES.BAD_REQUEST)
    }

    const conversation = await aiService.getConversation(id, req.user.userId)
    if (!conversation) {
      return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
    }

    res.json(conversation)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'getConversation' } })
    sendError(res, 500, 'Failed to load conversation.', ERROR_CODES.INTERNAL)
  }
})

// DELETE /api/ai/conversations/:id
router.delete(
  '/conversations/:id',
  requireAuth,
  requireTrustedOrigin,
  writeLimiter,
  async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10)
      if (!Number.isInteger(id) || id < 1) {
        return sendError(res, 400, 'Invalid conversation ID.', ERROR_CODES.BAD_REQUEST)
      }

      const deleted = await aiService.deleteConversation(id, req.user.userId)
      if (!deleted) {
        return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
      }

      res.json({ message: 'Conversation deleted.' })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'deleteConversation' } })
      sendError(res, 500, 'Failed to delete conversation.', ERROR_CODES.INTERNAL)
    }
  },
)

// PATCH /api/ai/conversations/:id
router.patch(
  '/conversations/:id',
  requireAuth,
  requireTrustedOrigin,
  writeLimiter,
  async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10)
      if (!Number.isInteger(id) || id < 1) {
        return sendError(res, 400, 'Invalid conversation ID.', ERROR_CODES.BAD_REQUEST)
      }

      const { title } = req.body
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'Title is required.', ERROR_CODES.BAD_REQUEST)
      }

      const updated = await aiService.renameConversation(
        id,
        req.user.userId,
        title.trim().slice(0, 200),
      )
      if (!updated) {
        return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
      }

      res.json(updated)
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'renameConversation' } })
      sendError(res, 500, 'Failed to rename conversation.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── Send message (SSE streaming response) ──────────────────────────

// POST /api/ai/messages
// CLAUDE.md A11 — `requireTrustedOrigin` is mandatory on every write
// route in this module. The `/messages` endpoint is the most expensive
// surface in the entire AI module (it triggers Anthropic API calls and
// burns daily quota), so the cross-origin defense is non-negotiable.
router.post('/messages', requireAuth, requireTrustedOrigin, aiMessageLimiter, async (req, res) => {
  try {
    const { conversationId, content, currentPage, images, attachmentIds } = req.body
    // Hub AI v2 — attachmentIds is an array of AiAttachment.id values.
    // We allow up to 5 per request; the service layer re-checks
    // ownership + soft-delete state before forwarding to Anthropic.
    if (attachmentIds !== undefined) {
      if (!Array.isArray(attachmentIds) || attachmentIds.length > 5) {
        return res.status(400).json({ error: 'attachmentIds must be an array of up to 5 ids.' })
      }
      for (const a of attachmentIds) {
        const n = Number.parseInt(a, 10)
        if (!Number.isInteger(n) || n < 1) {
          return res.status(400).json({ error: 'Each attachmentId must be a positive integer.' })
        }
      }
    }

    // Validate required fields. CLAUDE.md A12: parseInt + Number.isInteger.
    const conversationIdInt = Number.parseInt(conversationId, 10)
    if (!Number.isInteger(conversationIdInt) || conversationIdInt < 1) {
      return res.status(400).json({ error: 'Invalid conversationId.' })
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
        // Magic-byte check — verifies the actual file matches the
        // claimed MIME so a client can't smuggle a non-image binary
        // (PE / ELF / HTML) under `mediaType: 'image/png'`. Decode
        // only the first 12 bytes to keep this cheap. Loop B finding
        // I2, 2026-05-03 audit.
        try {
          const head = Buffer.from(img.base64.slice(0, 16), 'base64')
          const ok =
            (img.mediaType === 'image/png' &&
              head[0] === 0x89 &&
              head[1] === 0x50 &&
              head[2] === 0x4e &&
              head[3] === 0x47) ||
            (img.mediaType === 'image/jpeg' &&
              head[0] === 0xff &&
              head[1] === 0xd8 &&
              head[2] === 0xff) ||
            (img.mediaType === 'image/webp' &&
              head[0] === 0x52 &&
              head[1] === 0x49 &&
              head[2] === 0x46 &&
              head[3] === 0x46 &&
              head[8] === 0x57 &&
              head[9] === 0x45 &&
              head[10] === 0x42 &&
              head[11] === 0x50) ||
            (img.mediaType === 'image/gif' &&
              head[0] === 0x47 &&
              head[1] === 0x49 &&
              head[2] === 0x46 &&
              head[3] === 0x38)
          if (!ok) {
            return res
              .status(400)
              .json({ error: `Image bytes do not match declared type ${img.mediaType}.` })
          }
        } catch {
          return res.status(400).json({ error: 'Invalid base64 in image payload.' })
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
      conversationId: conversationIdInt,
      content: content.trim(),
      currentPage: currentPage || null,
      images: images || null,
      attachmentIds: attachmentIds || null,
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

router.post(
  '/messages/:id/flag',
  requireAuth,
  requireTrustedOrigin,
  writeLimiter,
  async (req, res) => {
    try {
      const prisma = require('../../lib/prisma')
      const messageId = Number.parseInt(req.params.id, 10)
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return sendError(res, 400, 'Invalid message id.', ERROR_CODES.BAD_REQUEST)
      }
      const reason = String(req.body?.reason || '')
        .trim()
        .toLowerCase()
      if (!ALLOWED_FLAG_REASONS.has(reason)) {
        return sendError(res, 400, 'Invalid reason.', ERROR_CODES.VALIDATION)
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
      if (!message) {
        return sendError(res, 404, 'Message not found.', ERROR_CODES.NOT_FOUND)
      }
      // Only the conversation owner can flag — assistant messages only
      // (no point flagging your own user input).
      if (message.conversation.userId !== req.user.userId) {
        return sendError(
          res,
          403,
          'You can only flag your own AI conversations.',
          ERROR_CODES.FORBIDDEN,
        )
      }
      if (message.role !== 'assistant') {
        return sendError(
          res,
          400,
          'Only assistant messages can be flagged.',
          ERROR_CODES.BAD_REQUEST,
        )
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
      sendError(res, 500, 'Failed to flag message.', ERROR_CODES.INTERNAL)
    }
  },
)

// POST /api/ai/save-to-notes
// L15-HIGH-1: persists an AI message as a private note for the current user.
// Frontend AiSaveToNotesButton.jsx posts here.
router.post('/save-to-notes', requireAuth, requireTrustedOrigin, writeLimiter, async (req, res) => {
  try {
    const { messageId, courseId, title, content } = req.body || {}
    const messageIdInt = Number.parseInt(messageId, 10)
    if (!Number.isInteger(messageIdInt) || messageIdInt < 1) {
      return sendError(res, 400, 'Invalid messageId.', ERROR_CODES.BAD_REQUEST)
    }
    const titleStr = typeof title === 'string' ? title.trim().slice(0, 140) : ''
    const contentStr = typeof content === 'string' ? content.trim().slice(0, 50000) : ''
    if (!titleStr) {
      return sendError(res, 400, 'Title is required.', ERROR_CODES.VALIDATION)
    }
    if (!contentStr) {
      return sendError(res, 400, 'Content is required.', ERROR_CODES.VALIDATION)
    }
    let courseIdInt = null
    if (courseId !== undefined && courseId !== null && courseId !== '') {
      courseIdInt = Number.parseInt(courseId, 10)
      if (!Number.isInteger(courseIdInt) || courseIdInt < 1) {
        return sendError(res, 400, 'Invalid courseId.', ERROR_CODES.BAD_REQUEST)
      }
    }

    const prisma = require('../../lib/prisma')

    const message = await prisma.aiMessage.findFirst({
      where: { id: messageIdInt, conversation: { userId: req.user.userId } },
      select: { id: true, role: true },
    })
    if (!message) {
      return sendError(res, 404, 'Message not found.', ERROR_CODES.NOT_FOUND)
    }

    const note = await prisma.note.create({
      data: {
        userId: req.user.userId,
        courseId: courseIdInt,
        title: titleStr,
        content: contentStr,
        source: 'hub_ai_save',
        isPublic: false,
      },
      select: { id: true, title: true, courseId: true, createdAt: true },
    })

    res.status(201).json({ note })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'saveToNotes' } })
    sendError(res, 500, 'Failed to save note.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
