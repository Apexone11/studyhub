/**
 * messaging.routes.js — Real-time messaging API
 *
 * Endpoints:
 * - GET/POST /api/messages/conversations
 * - GET/PATCH/DELETE /api/messages/conversations/:id
 * - GET/POST /api/messages/conversations/:id/messages
 * - PATCH/DELETE /api/messages/:messageId
 * - POST/DELETE /api/messages/:messageId/reactions
 * - GET /api/messages/online
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getIO, getOnlineUsers } = require('../../lib/socketio')
const { readLimiter } = require('../../lib/rateLimiters')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')

const router = express.Router()

router.use(readLimiter)

// ===== CONVERSATIONS =====

/**
 * GET /api/messages/conversations
 * List user's conversations with pagination
 */
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    // Get blocked user IDs
    const blockedIds = await getBlockedUserIds(prisma, req.user.userId)

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
        unreadCount: 0, // Placeholder — could compute from lastReadAt
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
 * POST /api/messages/conversations
 * Create a new conversation or return existing DM
 */
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const { participantIds = [], type = 'dm', name } = req.body

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'Participants required.' })
    }

    if (type !== 'dm' && type !== 'group') {
      return res.status(400).json({ error: 'Invalid conversation type.' })
    }

    // Check for blocks with all participants
    const blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    for (const participantId of participantIds) {
      if (blockedIds.includes(participantId)) {
        return res.status(403).json({ error: 'Cannot message blocked user.' })
      }
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
        return res.json(existingDm)
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
 * GET /api/messages/conversations/:id
 * Get conversation details
 */
router.get('/conversations/:id', requireAuth, async (req, res) => {
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
 * PATCH /api/messages/conversations/:id
 * Update conversation (name, avatar, mute, archive)
 */
router.patch('/conversations/:id', requireAuth, async (req, res) => {
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
 * DELETE /api/messages/conversations/:id
 * Leave conversation (groups) or archive (DMs)
 */
router.delete('/conversations/:id', requireAuth, async (req, res) => {
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

// ===== MESSAGES =====

/**
 * GET /api/messages/conversations/:id/messages
 * List messages in a conversation (cursor-based pagination)
 */
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    const { before, limit = 50 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100)

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

    const where = {
      conversationId,
      deletedAt: null,
    }

    if (before) {
      const beforeId = parseInt(before, 10)
      if (!Number.isNaN(beforeId)) {
        where.id = { lt: beforeId }
      }
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: { id: true, username: true, avatarUrl: true },
        },
        replyTo: {
          select: { id: true, content: true, senderId: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
    })

    res.json(messages.reverse()) // Return in chronological order
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/messages/conversations/:id/messages
 * Send a message
 */
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    const { content, type = 'text', replyToId } = req.body

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Message content required.' })
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
      return res.status(404).json({ error: 'Conversation not found.' })
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: req.user.userId,
        content: content.trim(),
        type,
        replyToId: replyToId ? parseInt(replyToId, 10) : null,
      },
      include: {
        sender: {
          select: { id: true, username: true, avatarUrl: true },
        },
        replyTo: {
          select: { id: true, content: true, senderId: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    })

    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    // Emit via Socket.io to conversation room
    try {
      const io = getIO()
      io.to(`conversation:${conversationId}`).emit('message:new', message)
    } catch (err) {
      captureError(err, { source: 'socketio-message-send' })
    }

    res.status(201).json(message)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/messages/:messageId
 * Edit a message (owner only, within 15 min)
 */
router.patch('/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Message content required.' })
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' })
    }

    if (message.senderId !== req.user.userId) {
      return res.status(403).json({ error: 'Can only edit your own messages.' })
    }

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)
    if (message.createdAt < fifteenMinAgo) {
      return res.status(403).json({ error: 'Can only edit messages within 15 minutes.' })
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: { id: true, username: true, avatarUrl: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    })

    // Emit via Socket.io
    try {
      const io = getIO()
      io.to(`conversation:${message.conversationId}`).emit('message:edit', updated)
    } catch (err) {
      captureError(err, { source: 'socketio-message-edit' })
    }

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/messages/:messageId
 * Soft delete a message (owner or conversation admin)
 */
router.delete('/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: req.user.userId },
            },
          },
        },
      },
    })

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' })
    }

    const isOwner = message.senderId === req.user.userId
    const isAdmin = message.conversation.participants[0]?.role === 'admin'

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions.' })
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
      include: {
        sender: {
          select: { id: true, username: true },
        },
      },
    })

    // Emit via Socket.io
    try {
      const io = getIO()
      io.to(`conversation:${message.conversationId}`).emit('message:delete', {
        messageId,
        conversationId: message.conversationId,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-message-delete' })
    }

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ===== REACTIONS =====

/**
 * POST /api/messages/:messageId/reactions
 * Add a reaction
 */
router.post('/messages/:messageId/reactions', requireAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)
    const { emoji } = req.body

    if (!emoji || typeof emoji !== 'string' || emoji.trim() === '') {
      return res.status(400).json({ error: 'Emoji required.' })
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' })
    }

    // Create or update reaction (upsert)
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: req.user.userId,
          emoji: emoji.trim(),
        },
      },
      update: { createdAt: new Date() },
      create: {
        messageId,
        userId: req.user.userId,
        emoji: emoji.trim(),
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    })

    // Emit via Socket.io
    try {
      const io = getIO()
      io.to(`conversation:${message.conversationId}`).emit('reaction:add', {
        messageId,
        reaction,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-reaction-add' })
    }

    res.status(201).json(reaction)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/messages/:messageId/reactions/:emoji
 * Remove a reaction
 */
router.delete('/messages/:messageId/reactions/:emoji', requireAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)
    const emoji = decodeURIComponent(req.params.emoji)

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' })
    }

    await prisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId: req.user.userId,
        emoji,
      },
    })

    // Emit via Socket.io
    try {
      const io = getIO()
      io.to(`conversation:${message.conversationId}`).emit('reaction:remove', {
        messageId,
        emoji,
        userId: req.user.userId,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-reaction-remove' })
    }

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ===== PRESENCE =====

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
