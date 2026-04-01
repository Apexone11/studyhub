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
const rateLimit = require('express-rate-limit')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { readLimiter } = require('../../lib/rateLimiters')
const aiService = require('./ai.service')
const { MAX_MESSAGE_LENGTH, MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES, AI_RATE_LIMIT_RPM } = require('./ai.constants')

const router = express.Router()

// Per-user rate limit for AI message sending (stricter than general API).
const aiMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: AI_RATE_LIMIT_RPM,
  keyGenerator: (req) => `ai_${req.user?.userId || req.ip}`,
  message: { error: 'Too many AI requests. Please wait a moment.' },
})

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
router.post('/conversations', requireAuth, async (req, res) => {
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
router.delete('/conversations/:id', requireAuth, async (req, res) => {
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
router.patch('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid conversation ID.' })

    const { title } = req.body
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required.' })
    }

    const updated = await aiService.renameConversation(id, req.user.userId, title.trim().slice(0, 200))
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
      return res.status(400).json({ error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` })
    }

    // Validate images if provided.
    if (images) {
      if (!Array.isArray(images) || images.length > MAX_IMAGES_PER_MESSAGE) {
        return res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_MESSAGE} images per message.` })
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

    // Set SSE headers.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

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

// GET /api/ai/usage
router.get('/usage', requireAuth, readLimiter, async (req, res) => {
  try {
    const prisma = require('../../lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true, emailVerified: true, isStaffVerified: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const stats = await aiService.getUsageStats(user)
    res.json(stats)
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'getUsage' } })
    res.status(500).json({ error: 'Failed to load usage stats.' })
  }
})

module.exports = router
