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
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getIO } = require('../../lib/socketio')
const SOCKET_EVENTS = require('../../lib/socketEvents')
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
      return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
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
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
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
    const rawContent = typeof content === 'string' ? content.trim() : ''

    if (!rawContent && !hasAttachments && !poll) {
      return sendError(res, 400, 'Message content required.', ERROR_CODES.BAD_REQUEST)
    }

    // Sanitize content to prevent stored XSS
    const cleanContent = rawContent ? sanitizeMessageContent(rawContent) : ''

    if (cleanContent.length > MAX_MESSAGE_LENGTH) {
      return sendError(
        res,
        400,
        `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
        ERROR_CODES.BAD_REQUEST,
      )
    }

    // Validate poll if provided
    if (poll) {
      if (!poll.question || typeof poll.question !== 'string' || poll.question.trim() === '') {
        return sendError(res, 400, 'Poll question required.', ERROR_CODES.BAD_REQUEST)
      }
      if (!Array.isArray(poll.options) || poll.options.length < 2) {
        return sendError(res, 400, 'Poll must have at least 2 options.', ERROR_CODES.BAD_REQUEST)
      }
      if (poll.options.length > 10) {
        return sendError(
          res,
          400,
          'Poll cannot have more than 10 options.',
          ERROR_CODES.BAD_REQUEST,
        )
      }
    }

    // Validate attachments
    if (attachments.length > 5) {
      return sendError(res, 400, 'Maximum 5 attachments per message.', ERROR_CODES.BAD_REQUEST)
    }

    for (const att of attachments) {
      if (!att.url || typeof att.url !== 'string') {
        return sendError(res, 400, 'Attachment URL required.', ERROR_CODES.BAD_REQUEST)
      }
      // Only allow well-formed https URLs for attachments
      if (!att.url.startsWith('https://')) {
        return sendError(res, 400, 'Attachment URL must use HTTPS.', ERROR_CODES.BAD_REQUEST)
      }
      try {
        const parsed = new URL(att.url)
        if (parsed.protocol !== 'https:') {
          return sendError(res, 400, 'Attachment URL must use HTTPS.', ERROR_CODES.BAD_REQUEST)
        }
      } catch {
        return sendError(res, 400, 'Attachment URL is not valid.', ERROR_CODES.BAD_REQUEST)
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
      return sendError(res, 404, 'Conversation not found.', ERROR_CODES.NOT_FOUND)
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
      io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, message)
    } catch (err) {
      captureError(err, { source: 'socketio-message-send' })
    }

    res.status(201).json(message)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
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
      return sendError(res, 400, 'Message content required.', ERROR_CODES.BAD_REQUEST)
    }

    const cleanContent = sanitizeMessageContent(content)

    if (cleanContent.length === 0) {
      return sendError(res, 400, 'Message content required.', ERROR_CODES.BAD_REQUEST)
    }

    if (cleanContent.length > MAX_MESSAGE_LENGTH) {
      return sendError(
        res,
        400,
        `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
        ERROR_CODES.BAD_REQUEST,
      )
    }

    // Verify participant AND message owner
    const verified = await verifyMessageParticipant(req, res, messageId)
    if (!verified) return

    const { message } = verified

    if (message.senderId !== req.user.userId) {
      return sendError(res, 403, 'Can only edit your own messages.', ERROR_CODES.FORBIDDEN)
    }

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)
    if (message.createdAt < fifteenMinAgo) {
      return sendError(res, 403, 'Can only edit messages within 15 minutes.', ERROR_CODES.FORBIDDEN)
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
      io.to(`conversation:${message.conversationId}`).emit(SOCKET_EVENTS.MESSAGE_EDIT, updated)
    } catch (err) {
      captureError(err, { source: 'socketio-message-edit' })
    }

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
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
      return sendError(res, 404, 'Message not found.', ERROR_CODES.NOT_FOUND)
    }

    const isOwner = message.senderId === req.user.userId
    const isAdmin = message.conversation.participants[0]?.role === 'admin'

    if (!isOwner && !isAdmin) {
      return sendError(res, 403, 'Insufficient permissions.', ERROR_CODES.FORBIDDEN)
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
      io.to(`conversation:${message.conversationId}`).emit(SOCKET_EVENTS.MESSAGE_DELETE, {
        messageId,
        conversationId: message.conversationId,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-message-delete' })
    }

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
