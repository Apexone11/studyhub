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
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { messagingWriteLimiter } = require('../../lib/rateLimiters')
const { getIO } = require('../../lib/socketio')
const { verifyMessageParticipant } = require('./messaging.helpers')

const router = express.Router({ mergeParams: true })

/**
 * POST /messages/:messageId/reactions
 * Add a reaction
 */
router.post('/:messageId/reactions', requireAuth, messagingWriteLimiter, async (req, res) => {
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
 * DELETE /messages/:messageId/reactions/:emoji
 * Remove a reaction
 */
router.delete('/:messageId/reactions/:emoji', requireAuth, messagingWriteLimiter, async (req, res) => {
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

/**
 * POST /messages/:messageId/poll/vote
 * Vote on a poll option
 */
router.post('/:messageId/poll/vote', requireAuth, messagingWriteLimiter, async (req, res) => {
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
 * POST /messages/:messageId/poll/close
 * Close a poll (message sender or conversation admin only)
 */
router.post('/:messageId/poll/close', requireAuth, messagingWriteLimiter, async (req, res) => {
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

module.exports = router
