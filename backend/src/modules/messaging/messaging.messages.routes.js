/**
 * messaging.messages.routes.js — Message CRUD endpoints
 *
 * Endpoints:
 * - GET /conversations/:id/messages - List messages in a conversation
 * - POST /conversations/:id/messages - Send a message
 * - PATCH /messages/:messageId - Edit a message
 * - DELETE /messages/:messageId - Soft delete a message
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getIO } = require('../../lib/socketio')
const {
  MAX_MESSAGE_LENGTH,
  sanitizeMessageContent,
  verifyMessageParticipant,
} = require('./messaging.helpers')

const router = express.Router({ mergeParams: true })

router.use(readLimiter)

/**
 * GET /conversations/:id/messages
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
 * POST /conversations/:id/messages
 * Send a message with optional attachments and poll
 */
router.post('/conversations/:id/messages', requireAuth, messagingWriteLimiter, async (req, res) => {
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
 * PATCH /messages/:messageId
 * Edit a message (owner only, within 15 min)
 */
router.patch('/:messageId', requireAuth, messagingWriteLimiter, async (req, res) => {
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
 * DELETE /messages/:messageId
 * Soft delete a message (owner or conversation admin)
 */
router.delete('/:messageId', requireAuth, async (req, res) => {
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

module.exports = router
