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
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getOnlineUsers } = require('../../lib/socketio')
const { readLimiter } = require('../../lib/rateLimiters')

// Import sub-routers
const conversationsRouter = require('./messaging.conversations.routes')
const messagesRouter = require('./messaging.messages.routes')
const reactionsRouter = require('./messaging.reactions.routes')

const router = express.Router()

router.use(readLimiter)

// Mount sub-routers
// Conversations router handles /conversations, /conversations/:id, /conversations/:id/read
router.use('/conversations', conversationsRouter)
// Messages router handles /conversations/:id/messages (list/send) and /:messageId (edit/delete)
// Mounted at root since its routes already include full path prefixes
router.use('/', messagesRouter)
// Reactions router handles /:messageId/reactions
router.use('/', reactionsRouter)

/**
 * GET /api/messages/unread-total
 * Get total unread message count across all conversations.
 * Used by the navbar badge.
 */
router.get('/unread-total', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId

    const participants = await prisma.conversationParticipant.findMany({
      where: { userId },
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
    res.status(500).json({ error: 'Server error.' })
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
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
