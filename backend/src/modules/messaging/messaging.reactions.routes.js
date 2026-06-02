/**
 * messaging.reactions.routes.js — Message reaction endpoints
 *
 * Endpoints:
 * - POST /messages/:messageId/reactions - Add a reaction
 * - DELETE /messages/:messageId/reactions/:emoji - Remove a reaction
 * - POST /messages/:messageId/poll/vote - Vote on a poll option
 * - POST /messages/:messageId/poll/close - Close a poll
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getIO } = require('../../lib/socketio')
const SOCKET_EVENTS = require('../../lib/socketEvents')
const { verifyMessageParticipant } = require('./messaging.helpers')

const router = express.Router({ mergeParams: true })

// Hard cap aligned with `MessageReaction.emoji` VarChar(16) column in
// schema.prisma. A looser gate lets Postgres silently truncate to 16 bytes,
// which (a) loses the trailing characters of any long emoji sequence and
// (b) breaks the upsert unique key because the truncated value collides with
// shorter pre-existing entries.
const MAX_EMOJI_LENGTH = 16

// Reject ASCII control characters (0x00–0x1F, 0x7F). Emoji codepoints
// start at 0x1F300+, so this guard never rejects real emoji input — it
// only filters invisible artefacts that render as nothing in the strip
// and confuse screen readers. Written with `\xNN` escape sequences (not
// literal control bytes) so the source file stays plain-text for diff /
// blame / search tooling.
// eslint-disable-next-line no-control-regex
const REACTION_CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/

/**
 * POST /messages/:messageId/reactions
 * Add a reaction
 */
router.post('/:messageId/reactions', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const messageId = Number.parseInt(req.params.messageId, 10)
    if (!Number.isInteger(messageId) || messageId < 1) {
      return sendError(res, 400, 'Invalid message ID.', ERROR_CODES.BAD_REQUEST)
    }
    const { emoji } = req.body

    if (!emoji || typeof emoji !== 'string' || emoji.trim() === '') {
      return sendError(res, 400, 'Reaction required.', ERROR_CODES.BAD_REQUEST)
    }

    const trimmedEmoji = emoji.trim()
    if (trimmedEmoji.length > MAX_EMOJI_LENGTH) {
      return sendError(res, 400, 'Reaction too long.', ERROR_CODES.BAD_REQUEST)
    }
    if (REACTION_CONTROL_CHAR_RE.test(trimmedEmoji)) {
      return sendError(res, 400, 'Reaction contains invalid characters.', ERROR_CODES.BAD_REQUEST)
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
          emoji: trimmedEmoji,
        },
      },
      update: { createdAt: new Date() },
      create: {
        messageId,
        userId: req.user.userId,
        emoji: trimmedEmoji,
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
      io.to(`conversation:${verified.message.conversationId}`).emit(SOCKET_EVENTS.REACTION_ADD, {
        messageId,
        reaction,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-reaction-add' })
    }

    res.status(201).json(reaction)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * DELETE /messages/:messageId/reactions/:emoji
 * Remove a reaction
 */
router.delete(
  '/:messageId/reactions/:emoji',
  requireAuth,
  messagingWriteLimiter,
  async (req, res) => {
    try {
      const messageId = Number.parseInt(req.params.messageId, 10)
      if (!Number.isInteger(messageId) || messageId < 1) {
        return sendError(res, 400, 'Invalid message ID.', ERROR_CODES.BAD_REQUEST)
      }
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
        io.to(`conversation:${verified.message.conversationId}`).emit(
          SOCKET_EVENTS.REACTION_REMOVE,
          {
            messageId,
            emoji,
            userId: req.user.userId,
          },
        )
      } catch (err) {
        captureError(err, { source: 'socketio-reaction-remove' })
      }

      res.status(204).send()
    } catch (err) {
      captureError(err, { route: req.originalUrl, method: req.method })
      sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

/**
 * POST /messages/:messageId/poll/vote
 * Vote on a poll option
 */
router.post('/:messageId/poll/vote', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const messageId = Number.parseInt(req.params.messageId, 10)
    if (!Number.isInteger(messageId) || messageId < 1) {
      return sendError(res, 400, 'Invalid message ID.', ERROR_CODES.BAD_REQUEST)
    }
    const { optionId } = req.body

    if (!optionId) {
      return sendError(res, 400, 'Option ID required.', ERROR_CODES.BAD_REQUEST)
    }

    const optionIdNum = Number.parseInt(optionId, 10)
    if (!Number.isInteger(optionIdNum) || optionIdNum < 1) {
      return sendError(res, 400, 'Invalid option id.', ERROR_CODES.BAD_REQUEST)
    }

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
      return sendError(res, 400, 'Message does not contain a poll.', ERROR_CODES.BAD_REQUEST)
    }

    // Check if poll is closed
    if (messagePoll.poll.closedAt) {
      return sendError(res, 400, 'Poll is closed.', ERROR_CODES.BAD_REQUEST)
    }

    // Find the option
    const option = messagePoll.poll.options.find((opt) => opt.id === optionIdNum)
    if (!option) {
      return sendError(res, 404, 'Option not found.', ERROR_CODES.NOT_FOUND)
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
      io.to(`conversation:${verified.message.conversationId}`).emit(SOCKET_EVENTS.POLL_VOTE, {
        messageId,
        poll: updatedMessage.poll,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-poll-vote' })
    }

    res.status(201).json(vote)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /messages/:messageId/poll/close
 * Close a poll (message sender or conversation admin only)
 */
router.post('/:messageId/poll/close', requireAuth, messagingWriteLimiter, async (req, res) => {
  try {
    const messageId = Number.parseInt(req.params.messageId, 10)
    if (!Number.isInteger(messageId) || messageId < 1) {
      return sendError(res, 400, 'Invalid message ID.', ERROR_CODES.BAD_REQUEST)
    }

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
      return sendError(res, 400, 'Message does not contain a poll.', ERROR_CODES.BAD_REQUEST)
    }

    // Check permissions: message sender or conversation admin only
    const isOwner = msgRecord.senderId === req.user.userId
    const isConvoAdmin = userParticipant.role === 'admin'

    if (!isOwner && !isConvoAdmin) {
      return sendError(res, 403, 'Insufficient permissions.', ERROR_CODES.FORBIDDEN)
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
      io.to(`conversation:${msgRecord.conversationId}`).emit(SOCKET_EVENTS.POLL_CLOSE, {
        messageId,
        poll: closedPoll,
      })
    } catch (err) {
      captureError(err, { source: 'socketio-poll-close' })
    }

    res.json(closedPoll)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
module.exports.__internal = { MAX_EMOJI_LENGTH, REACTION_CONTROL_CHAR_RE }
