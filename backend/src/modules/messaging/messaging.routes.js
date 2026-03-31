/**
 * messaging.routes.js — Real-time messaging API
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
 * Endpoints:
 * - GET/POST /api/messages/conversations
 * - GET/PATCH/DELETE /api/messages/conversations/:id
 * - GET/POST /api/messages/conversations/:id/messages
 * - PATCH/DELETE /api/messages/:messageId
 * - POST/DELETE /api/messages/:messageId/reactions
 * - POST /api/messages/:messageId/poll/vote
 * - POST /api/messages/:messageId/poll/close
 * - GET /api/messages/online
 */

const express = require('express')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getIO, getOnlineUsers } = require('../../lib/socketio')
const { readLimiter } = require('../../lib/rateLimiters')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')

const router = express.Router()

const MAX_MESSAGE_LENGTH = 5000

/**
 * Verify the requesting user is a participant in the conversation that
 * contains the given message.  Returns { message, participant } on success,
 * or sends an error response and returns null.
 */
async function verifyMessageParticipant(req, res, messageId) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, createdAt: true, deletedAt: true },
  })

  if (!message || message.deletedAt) {
    res.status(404).json({ error: 'Message not found.' })
    return null
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: req.user.userId,
      },
    },
  })

  if (!participant) {
    // Return 404 instead of 403 to avoid leaking message existence
    res.status(404).json({ error: 'Message not found.' })
    return null
  }

  return { message, participant }
}

/**
 * Sanitize message content to prevent stored XSS.  Strips HTML tags.
 */
function sanitizeMessageContent(content) {
  return String(content)
    .replace(/<[^>]*>/g, '')
    .trim()
}

const messageWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many messages. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

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
        attachments: true,
        poll: {
          include: {
            options: {
              orderBy: { position: 'asc' },
              include: {
                votes: {
                  include: {
                    user: {
                      select: { id: true, username: true },
                    },
                  },
                },
              },
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
 * Send a message with optional attachments and poll
 */
router.post('/conversations/:id/messages', requireAuth, messageWriteLimiter, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    const { content, type = 'text', replyToId, attachments = [], poll } = req.body

    // Allow empty content when attachments are present (e.g. GIF-only messages)
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const rawContent = (typeof content === 'string') ? content.trim() : ''

    if (!rawContent && !hasAttachments && !poll) {
      return res.status(400).json({ error: 'Message content required.' })
    }

    // Sanitize content to prevent stored XSS
    const cleanContent = rawContent ? sanitizeMessageContent(rawContent) : ''

    if (cleanContent.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` })
    }

    // Validate poll if provided
    if (poll) {
      if (!poll.question || typeof poll.question !== 'string' || poll.question.trim() === '') {
        return res.status(400).json({ error: 'Poll question required.' })
      }
      if (!Array.isArray(poll.options) || poll.options.length < 2) {
        return res.status(400).json({ error: 'Poll must have at least 2 options.' })
      }
      if (poll.options.length > 10) {
        return res.status(400).json({ error: 'Poll cannot have more than 10 options.' })
      }
    }

    // Validate attachments
    if (attachments.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 attachments per message.' })
    }

    for (const att of attachments) {
      if (!att.url || typeof att.url !== 'string') {
        return res.status(400).json({ error: 'Attachment URL required.' })
      }
      // Only allow well-formed https URLs for attachments
      if (!att.url.startsWith('https://')) {
        return res.status(400).json({ error: 'Attachment URL must use HTTPS.' })
      }
      try {
        const parsed = new URL(att.url)
        if (parsed.protocol !== 'https:') {
          return res.status(400).json({ error: 'Attachment URL must use HTTPS.' })
        }
      } catch {
        return res.status(400).json({ error: 'Attachment URL is not valid.' })
      }
      // Sanitize fileName to prevent path traversal or injection
      if (att.fileName && typeof att.fileName === 'string') {
        att.fileName = att.fileName.replace(/[<>"/\\|?*]/g, '').slice(0, 255)
      }
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
        content: cleanContent,
        type,
        replyToId: replyToId ? parseInt(replyToId, 10) : null,
        // Create attachments if provided
        ...(attachments.length > 0 && {
          attachments: {
            create: attachments.map((att) => ({
              type: att.type || 'image',
              url: att.url,
              fileName: att.fileName,
              fileSize: att.fileSize,
              mimeType: att.mimeType,
              width: att.width,
              height: att.height,
            })),
          },
        }),
        // Create poll if provided
        ...(poll && {
          poll: {
            create: {
              question: poll.question.trim(),
              allowMultiple: poll.allowMultiple || false,
              options: {
                create: poll.options.map((opt, index) => ({
                  text: opt.trim(),
                  position: index,
                })),
              },
            },
          },
        }),
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
        attachments: true,
        poll: {
          include: {
            options: {
              orderBy: { position: 'asc' },
              include: {
                votes: {
                  include: {
                    user: {
                      select: { id: true, username: true },
                    },
                  },
                },
              },
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
router.patch('/messages/:messageId', requireAuth, messageWriteLimiter, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Message content required.' })
    }

    const cleanContent = sanitizeMessageContent(content)

    if (cleanContent.length === 0) {
      return res.status(400).json({ error: 'Message content required.' })
    }

    if (cleanContent.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` })
    }

    // Verify participant AND message owner
    const verified = await verifyMessageParticipant(req, res, messageId)
    if (!verified) return

    const { message } = verified

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
        content: cleanContent,
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
        attachments: true,
        poll: {
          include: {
            options: {
              orderBy: { position: 'asc' },
              include: {
                votes: {
                  include: {
                    user: {
                      select: { id: true, username: true },
                    },
                  },
                },
              },
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

// ===== POLLS =====

/**
 * POST /api/messages/:messageId/poll/vote
 * Vote on a poll option
 */
router.post('/messages/:messageId/poll/vote', requireAuth, messageWriteLimiter, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)
    const { optionId } = req.body

    if (!optionId) {
      return res.status(400).json({ error: 'Option ID required.' })
    }

    const optionIdNum = parseInt(optionId, 10)

    // Verify the user is a participant in the conversation
    const verified = await verifyMessageParticipant(req, res, messageId)
    if (!verified) return

    // Find the message's poll
    const messagePoll = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        poll: {
          include: {
            options: {
              include: {
                votes: true,
              },
            },
          },
        },
      },
    })

    if (!messagePoll.poll) {
      return res.status(400).json({ error: 'Message does not contain a poll.' })
    }

    // Check if poll is closed
    if (messagePoll.poll.closedAt) {
      return res.status(400).json({ error: 'Poll is closed.' })
    }

    // Find the option
    const option = messagePoll.poll.options.find((opt) => opt.id === optionIdNum)
    if (!option) {
      return res.status(404).json({ error: 'Option not found.' })
    }

    // Check if user already voted
    const existingVote = await prisma.messagePollVote.findFirst({
      where: {
        pollId: messagePoll.poll.id,
        userId: req.user.userId,
      },
    })

    // If allowMultiple is false and user already voted, remove previous vote
    if (existingVote && !messagePoll.poll.allowMultiple) {
      await prisma.messagePollVote.delete({
        where: {
          pollId_optionId_userId: {
            pollId: messagePoll.poll.id,
            optionId: existingVote.optionId,
            userId: req.user.userId,
          },
        },
      })
    }

    // Create new vote (upsert to handle if they voted for same option)
    const vote = await prisma.messagePollVote.upsert({
      where: {
        pollId_optionId_userId: {
          pollId: messagePoll.poll.id,
          optionId: optionIdNum,
          userId: req.user.userId,
        },
      },
      update: { createdAt: new Date() },
      create: {
        pollId: messagePoll.poll.id,
        optionId: optionIdNum,
        userId: req.user.userId,
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    })

    // Fetch updated poll with all votes
    const updatedMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        poll: {
          include: {
            options: {
              orderBy: { position: 'asc' },
              include: {
                votes: {
                  include: {
                    user: {
                      select: { id: true, username: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    // Emit via Socket.io
    try {
      const io = getIO()
      io.to(`conversation:${verified.message.conversationId}`).emit('poll:vote', {
        messageId,
        poll: updatedMessage.poll,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-poll-vote' })
    }

    res.status(201).json(vote)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/messages/:messageId/poll/close
 * Close a poll (message sender or conversation admin only)
 */
router.post('/messages/:messageId/poll/close', requireAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10)

    // Verify the user is a participant in the conversation
    const verified = await verifyMessageParticipant(req, res, messageId)
    if (!verified) return

    const { message: msgRecord, participant: userParticipant } = verified

    const messagePollData = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        poll: {
          include: {
            options: {
              include: {
                votes: {
                  include: {
                    user: {
                      select: { id: true, username: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!messagePollData.poll) {
      return res.status(400).json({ error: 'Message does not contain a poll.' })
    }

    // Check permissions: message sender or conversation admin only
    const isOwner = msgRecord.senderId === req.user.userId
    const isConvoAdmin = userParticipant.role === 'admin'

    if (!isOwner && !isConvoAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions.' })
    }

    // Close the poll
    const closedPoll = await prisma.messagePoll.update({
      where: { id: messagePollData.poll.id },
      data: { closedAt: new Date() },
      include: {
        options: {
          orderBy: { position: 'asc' },
          include: {
            votes: {
              include: {
                user: {
                  select: { id: true, username: true },
                },
              },
            },
          },
        },
      },
    })

    // Emit via Socket.io
    try {
      const io = getIO()
      io.to(`conversation:${msgRecord.conversationId}`).emit('poll:close', {
        messageId,
        poll: closedPoll,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-poll-close' })
    }

    res.json(closedPoll)
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
      return res.status(400).json({ error: 'Reaction required.' })
    }

    // Limit reaction length to prevent abuse
    if (emoji.trim().length > 32) {
      return res.status(400).json({ error: 'Reaction too long.' })
    }

    // Verify the user is a participant in the conversation
    const verified = await verifyMessageParticipant(req, res, messageId)
    if (!verified) return

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
      io.to(`conversation:${verified.message.conversationId}`).emit('reaction:add', {
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

    // Verify the user is a participant in the conversation
    const verified = await verifyMessageParticipant(req, res, messageId)
    if (!verified) return

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
      io.to(`conversation:${verified.message.conversationId}`).emit('reaction:remove', {
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
