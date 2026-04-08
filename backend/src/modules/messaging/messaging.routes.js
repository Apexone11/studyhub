/**
 * messaging.routes.js — Real-time messaging API (main router)
 *
 * SECURITY POLICY:
 * - All conversation data is strictly participant-only.  There is no platform
 *   admin bypass.  Even users with role "admin" or "staff" cannot access
 *   conversations they are not a participant of.
 * - Every endpoint that touches messages or sub-resources (reactions, polls)
 *   verifies the requesting user is a ConversationParticipant.
 * - Message content is sanitized (HTML stripped) on write to prevent stored XSS.
 * - Attachment URLs must use HTTPS.
 * - Socket.io rooms are scoped to conversations the user is a participant of;
 *   the server verifies membership before joining rooms.
 *
 * Main Endpoints:
 * - /conversations/* - Conversation CRUD and read receipts
 * - /messages/* - Message CRUD
 * - /messages/:messageId/reactions - Reactions and polls
 * - GET /unread-total - Total unread count
 * - GET /online - Online user IDs
 * - GET /requests - Pending message requests
 * - POST /requests/:conversationId/accept - Accept a message request
 * - POST /requests/:conversationId/decline - Decline a message request
 * - GET /archived - Archived conversations
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getOnlineUsers } = require('../../lib/socketio')
const { readLimiter, messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { formatConversationItem } = require('./messaging.helpers')

// Import sub-routers
const conversationsRouter = require('./messaging.conversations.routes')
const { conversationInclude, attachUnreadCount } = require('./messaging.conversations.routes')
const messagesRouter = require('./messaging.messages.routes')
const reactionsRouter = require('./messaging.reactions.routes')

const router = express.Router()

router.use(readLimiter)

// ─── Top-level endpoints (before sub-routers to avoid /:id conflicts) ───────

/**
 * GET /api/messages/unread-total
 * Get total unread message count across all active conversations.
 * Used by the navbar badge.
 */
router.get('/unread-total', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId

    // Only count unread from active (non-pending, non-declined) conversations
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        userId,
        status: 'active',
        archived: false,
      },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    })

    let total = 0
    for (const cp of participants) {
      try {
        const count = await prisma.message.count({
          where: {
            conversationId: cp.conversationId,
            createdAt: { gt: cp.lastReadAt || new Date(0) },
            senderId: { not: userId },
            deletedAt: null,
          },
        })
        total += count
      } catch {
        // Skip on error
      }
    }

    res.json({ total })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * GET /api/messages/online
 * Get list of online user IDs
 */
router.get('/online', (req, res) => {
  try {
    const onlineUserIds = getOnlineUsers()
    res.json({ online: onlineUserIds })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ─── Message Requests ───────────────────────────────────────────────────────

/**
 * GET /api/messages/requests
 * List pending message requests for the authenticated user.
 */
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    // Get blocked user IDs (graceful degradation)
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch (blockErr) {
      captureError(blockErr, { route: req.originalUrl, context: 'block-filter' })
    }

    const pending = await prisma.conversationParticipant.findMany({
      where: {
        userId: req.user.userId,
        status: 'pending',
        archived: false,
      },
      include: conversationInclude(req.user.userId),
      orderBy: { conversation: { updatedAt: 'desc' } },
      skip: offsetNum,
      take: limitNum,
    })

    // Count total pending for badge display
    const totalPending = await prisma.conversationParticipant.count({
      where: {
        userId: req.user.userId,
        status: 'pending',
        archived: false,
      },
    })

    // Compute unread counts
    for (const cp of pending) {
      await attachUnreadCount(cp, req.user.userId)
    }

    // Filter blocked users
    const requests = pending
      .filter((cp) => {
        if (cp.conversation.type === 'dm' && cp.conversation.participants.length > 0) {
          return !blockedIds.includes(cp.conversation.participants[0].user.id)
        }
        return true
      })
      .map(formatConversationItem)

    res.json({ requests, totalPending })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /api/messages/requests/:conversationId/accept
 * Accept a pending message request.
 */
router.post('/requests/:conversationId/accept', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId, 10)
    if (isNaN(conversationId)) {
      return sendError(res, 400, 'Invalid conversation ID.', ERROR_CODES.BAD_REQUEST)
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
    })

    if (!participant) {
      return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
    }

    if (participant.status !== 'pending') {
      return sendError(res, 400, 'This request has already been handled.', ERROR_CODES.BAD_REQUEST)
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { status: 'active' },
    })

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    })

    res.json(conversation)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /api/messages/requests/:conversationId/decline
 * Decline a pending message request.
 */
router.post('/requests/:conversationId/decline', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId, 10)
    if (isNaN(conversationId)) {
      return sendError(res, 400, 'Invalid conversation ID.', ERROR_CODES.BAD_REQUEST)
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
    })

    if (!participant) {
      return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
    }

    if (participant.status !== 'pending') {
      return sendError(res, 400, 'This request has already been handled.', ERROR_CODES.BAD_REQUEST)
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { status: 'declined' },
    })

    res.json({ declined: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ─── Archived Conversations ─────────────────────────────────────────────────

/**
 * GET /api/messages/archived
 * List archived conversations for the authenticated user.
 */
router.get('/archived', requireAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    // Get blocked user IDs (graceful degradation)
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch (blockErr) {
      captureError(blockErr, { route: req.originalUrl, context: 'block-filter' })
    }

    const archived = await prisma.conversationParticipant.findMany({
      where: {
        userId: req.user.userId,
        archived: true,
      },
      include: conversationInclude(req.user.userId),
      orderBy: { conversation: { updatedAt: 'desc' } },
      skip: offsetNum,
      take: limitNum,
    })

    // Compute unread counts
    for (const cp of archived) {
      await attachUnreadCount(cp, req.user.userId)
    }

    // Filter blocked users
    const result = archived
      .filter((cp) => {
        if (cp.conversation.type === 'dm' && cp.conversation.participants.length > 0) {
          return !blockedIds.includes(cp.conversation.participants[0].user.id)
        }
        return true
      })
      .map(formatConversationItem)

    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ─── Mount sub-routers ──────────────────────────────────────────────────────

// Conversations router handles /conversations, /conversations/:id, /conversations/:id/read
router.use('/conversations', conversationsRouter)
// Messages router handles /conversations/:id/messages (list/send) and /:messageId (edit/delete)
// Mounted at root since its routes already include full path prefixes
router.use('/', messagesRouter)
// Reactions router handles /:messageId/reactions
router.use('/', reactionsRouter)

module.exports = router
