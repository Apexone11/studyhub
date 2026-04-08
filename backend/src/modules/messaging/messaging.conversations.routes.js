/**
 * messaging.conversations.routes.js — Conversation CRUD endpoints
 *
 * Endpoints:
 * - GET /conversations - List user's active conversations
 * - POST /conversations - Create or return existing DM (with message-request logic)
 * - GET /conversations/:id - Get conversation details
 * - PATCH /conversations/:id - Update conversation (name, avatar, mute, archive)
 * - DELETE /conversations/:id - Leave conversation or archive DM
 * - POST /conversations/:id/read - Mark conversation as read
 * - POST /conversations/:id/mute - Mute conversation
 * - POST /conversations/:id/unmute - Unmute conversation
 * - POST /conversations/:id/archive - Archive conversation
 * - POST /conversations/:id/unarchive - Unarchive conversation
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { areMutualFollowers, formatConversationItem } = require('./messaging.helpers')

const router = express.Router({ mergeParams: true })

router.use(readLimiter)

// --- Shared include shape for conversation queries ---
function conversationInclude(userId) {
  return {
    conversation: {
      include: {
        createdBy: {
          select: { id: true, username: true, avatarUrl: true },
        },
        participants: {
          where: {
            userId: { notIn: [userId] }, // Exclude current user
          },
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Last message
          include: {
            sender: {
              select: { id: true, username: true },
            },
          },
        },
      },
    },
  }
}

/**
 * Compute unread count for a single ConversationParticipant record.
 * Attaches the result as cp._unreadCount.
 */
async function attachUnreadCount(cp, userId) {
  try {
    const lastReadAt = cp.lastReadAt || new Date(0)
    cp._unreadCount = await prisma.message.count({
      where: {
        conversationId: cp.conversation.id,
        createdAt: { gt: lastReadAt },
        senderId: { not: userId },
        deletedAt: null,
      },
    })
  } catch {
    cp._unreadCount = 0
  }
}

/**
 * GET /conversations
 * List user's active conversations (excludes pending, declined, and archived)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    // Get blocked user IDs (graceful degradation if block table unavailable)
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch (blockErr) {
      captureError(blockErr, { route: req.originalUrl, context: 'block-filter' })
    }

    // Only fetch conversations where participant status is 'active' and not archived
    const conversations = await prisma.conversationParticipant.findMany({
      where: {
        userId: req.user.userId,
        status: 'active',
        archived: false,
      },
      include: conversationInclude(req.user.userId),
      orderBy: { conversation: { updatedAt: 'desc' } },
      skip: offsetNum,
      take: limitNum,
    })

    // Compute unread counts per conversation
    for (const cp of conversations) {
      await attachUnreadCount(cp, req.user.userId)
    }

    // Filter out conversations with blocked users and format response
    const result = conversations
      .filter((cp) => {
        // For DMs, exclude if the other participant is blocked
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

/**
 * POST /conversations
 * Create a new conversation or return existing DM.
 *
 * For DMs between non-mutual followers, the recipient gets status 'pending'
 * (message request). Mutual followers get 'active' for both participants.
 */
router.post('/', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const { participantIds = [], type = 'dm', name } = req.body

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return sendError(res, 400, 'Participants required.', ERROR_CODES.BAD_REQUEST)
    }

    if (type !== 'dm' && type !== 'group') {
      return sendError(res, 400, 'Invalid conversation type.', ERROR_CODES.BAD_REQUEST)
    }

    // Check for blocks with all participants (graceful if block table unavailable)
    try {
      const blockedIds = await getBlockedUserIds(prisma, req.user.userId)
      for (const participantId of participantIds) {
        if (blockedIds.includes(participantId)) {
          return sendError(res, 403, 'Cannot message blocked user.', ERROR_CODES.FORBIDDEN)
        }
      }
    } catch (blockErr) {
      captureError(blockErr, { route: req.originalUrl, context: 'block-filter' })
    }

    // For DMs, check if conversation already exists between both users.
    if (type === 'dm' && participantIds.length === 1) {
      const existingDm = await prisma.conversation.findFirst({
        where: {
          type: 'dm',
          AND: [
            { participants: { some: { userId: req.user.userId } } },
            { participants: { some: { userId: participantIds[0] } } },
          ],
        },
      })

      if (existingDm) {
        // Re-activate if the sender previously declined or archived
        await prisma.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId: existingDm.id,
              userId: req.user.userId,
            },
          },
          data: { archived: false },
        })

        // Re-fetch with full participant data so the frontend has everything
        const fullDm = await prisma.conversation.findUnique({
          where: { id: existingDm.id },
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
        return res.json(fullDm)
      }
    }

    // For DMs, determine if this is a message request based on mutual follow status
    let recipientStatus = 'active'
    if (type === 'dm' && participantIds.length === 1) {
      try {
        const mutual = await areMutualFollowers(req.user.userId, participantIds[0])
        if (!mutual) {
          recipientStatus = 'pending'
        }
      } catch (followErr) {
        // If follow check fails, default to pending for safety
        captureError(followErr, { route: req.originalUrl, context: 'mutual-follow-check' })
        recipientStatus = 'pending'
      }
    }

    // Create conversation
    const participantData = participantIds.map((id) => ({
      userId: id,
      // For DMs: recipients get status based on mutual follow check
      // For groups: all participants are active
      status: type === 'dm' ? recipientStatus : 'active',
    }))

    const conversation = await prisma.conversation.create({
      data: {
        type,
        name: type === 'group' ? name : null,
        createdById: req.user.userId,
        participants: {
          create: [
            { userId: req.user.userId, role: 'admin', status: 'active' },
            ...participantData,
          ],
        },
      },
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

    res.status(201).json(conversation)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * GET /conversations/:id
 * Get conversation details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    if (isNaN(conversationId)) {
      return sendError(res, 400, 'Invalid conversation ID.', ERROR_CODES.BAD_REQUEST)
    }

    // Verify user is a participant
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
 * PATCH /conversations/:id
 * Update conversation (name, avatar, mute, archive)
 */
router.patch('/:id', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    const { name, avatarUrl, muted, archived } = req.body

    // Verify user is a participant (admin for group updates)
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

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
    }

    // Update conversation properties (admin only for group)
    if (name !== undefined || avatarUrl !== undefined) {
      if (conversation.type === 'group' && participant.role !== 'admin') {
        return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ...(name !== undefined && { name }),
          ...(avatarUrl !== undefined && { avatarUrl }),
          updatedAt: new Date(),
        },
      })
    }

    // Update participant properties (user's own settings)
    if (muted !== undefined || archived !== undefined) {
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: req.user.userId,
          },
        },
        data: {
          ...(muted !== undefined && { muted }),
          ...(archived !== undefined && { archived }),
        },
      })
    }

    const updated = await prisma.conversation.findUnique({
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

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * DELETE /conversations/:id
 * Leave conversation (groups) or archive (DMs)
 */
router.delete('/:id', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)

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

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (conversation.type === 'dm') {
      // Archive instead of deleting
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: req.user.userId,
          },
        },
        data: { archived: true },
      })
    } else {
      // Leave group
      await prisma.conversationParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId,
            userId: req.user.userId,
          },
        },
      })
    }

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /conversations/:id/read
 * Mark a conversation as read (HTTP fallback when Socket.io unavailable).
 */
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
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
      return sendError(res, 403, 'Not a participant.', ERROR_CODES.FORBIDDEN)
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { lastReadAt: new Date() },
    })

    res.json({ conversationId, unreadCount: 0 })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ─── Mute / Unmute ──────────────────────────────────────────────────────────

/**
 * POST /conversations/:id/mute
 * Mute notifications for a conversation.
 */
router.post('/:id/mute', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
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

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { muted: true },
    })

    res.json({ conversationId, muted: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /conversations/:id/unmute
 * Unmute notifications for a conversation.
 */
router.post('/:id/unmute', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
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

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { muted: false },
    })

    res.json({ conversationId, muted: false })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ─── Archive / Unarchive ────────────────────────────────────────────────────

/**
 * POST /conversations/:id/archive
 * Archive a conversation (hide from main list).
 */
router.post('/:id/archive', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
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

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { archived: true },
    })

    res.json({ conversationId, archived: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /conversations/:id/unarchive
 * Unarchive a conversation (restore to main list).
 */
router.post('/:id/unarchive', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
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

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.userId,
        },
      },
      data: { archived: false },
    })

    res.json({ conversationId, archived: false })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router

// Export shared utilities for use in the main messaging router
module.exports.conversationInclude = conversationInclude
module.exports.attachUnreadCount = attachUnreadCount
