/**
 * messaging.conversations.routes.js — Conversation CRUD endpoints
 *
 * Endpoints:
 * - GET /conversations - List user's conversations
 * - POST /conversations - Create or return existing DM
 * - GET /conversations/:id - Get conversation details
 * - PATCH /conversations/:id - Update conversation (name, avatar, mute, archive)
 * - DELETE /conversations/:id - Leave conversation or archive DM
 * - POST /conversations/:id/read - Mark conversation as read
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')

const router = express.Router({ mergeParams: true })

router.use(readLimiter)

/**
 * GET /conversations
 * List user's conversations with pagination
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

    // Fetch conversations for the user
    const conversations = await prisma.conversationParticipant.findMany({
      where: {
        userId: req.user.userId,
        archived: false,
      },
      include: {
        conversation: {
          include: {
            createdBy: {
              select: { id: true, username: true, avatarUrl: true },
            },
            participants: {
              where: {
                userId: { notIn: [req.user.userId] }, // Exclude current user
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
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
      skip: offsetNum,
      take: limitNum,
    })

    // Compute unread counts per conversation
    for (const cp of conversations) {
      try {
        const lastReadAt = cp.lastReadAt || new Date(0)
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: cp.conversation.id,
            createdAt: { gt: lastReadAt },
            senderId: { not: req.user.userId },
            deletedAt: null,
          },
        })
        cp._unreadCount = unreadCount
      } catch {
        cp._unreadCount = 0
      }
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
      .map((cp) => ({
        id: cp.conversation.id,
        type: cp.conversation.type,
        name: cp.conversation.name,
        avatarUrl: cp.conversation.avatarUrl,
        participants: cp.conversation.participants.map((p) => ({
          id: p.user.id,
          username: p.user.username,
          avatarUrl: p.user.avatarUrl,
        })),
        createdBy: cp.conversation.createdBy,
        lastMessage: cp.conversation.messages[0] || null,
        unreadCount: cp._unreadCount || 0,
        muted: cp.muted,
        lastReadAt: cp.lastReadAt,
        createdAt: cp.conversation.createdAt,
        updatedAt: cp.conversation.updatedAt,
      }))

    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /conversations
 * Create a new conversation or return existing DM
 */
router.post('/', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const { participantIds = [], type = 'dm', name } = req.body

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'Participants required.' })
    }

    if (type !== 'dm' && type !== 'group') {
      return res.status(400).json({ error: 'Invalid conversation type.' })
    }

    // Check for blocks with all participants (graceful if block table unavailable)
    try {
      const blockedIds = await getBlockedUserIds(prisma, req.user.userId)
      for (const participantId of participantIds) {
        if (blockedIds.includes(participantId)) {
          return res.status(403).json({ error: 'Cannot message blocked user.' })
        }
      }
    } catch (blockErr) {
      captureError(blockErr, { route: req.originalUrl, context: 'block-filter' })
    }

    // For DMs, check if conversation already exists
    if (type === 'dm' && participantIds.length === 1) {
      const existingDm = await prisma.conversation.findFirst({
        where: {
          type: 'dm',
          participants: {
            every: {
              userId: { in: [req.user.userId, participantIds[0]] },
            },
          },
        },
      })

      if (existingDm) {
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

    // Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        type,
        name: type === 'group' ? name : null,
        createdById: req.user.userId,
        participants: {
          create: [
            { userId: req.user.userId, role: 'admin' },
            ...participantIds.map((id) => ({ userId: id })),
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
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /conversations/:id
 * Get conversation details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)

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
      return res.status(404).json({ error: 'Conversation not found.' })
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
    res.status(500).json({ error: 'Server error.' })
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
      return res.status(404).json({ error: 'Conversation not found.' })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' })
    }

    // Update conversation properties (admin only for group)
    if (name !== undefined || avatarUrl !== undefined) {
      if (conversation.type === 'group' && participant.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' })
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
    res.status(500).json({ error: 'Server error.' })
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
      return res.status(404).json({ error: 'Conversation not found.' })
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
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /conversations/:id/read
 * Mark a conversation as read (HTTP fallback when Socket.io unavailable).
 * Updates lastReadAt to now and returns the new unread count (0).
 */
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' })
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
      return res.status(403).json({ error: 'Not a participant.' })
    }

    // Update lastReadAt to now
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
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
