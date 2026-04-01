/**
 * messaging.helpers.js — Shared messaging helpers and utilities
 *
 * These functions are used by multiple messaging route modules.
 */

const sanitizeHtml = require('sanitize-html')
const prisma = require('../../lib/prisma')

const MAX_MESSAGE_LENGTH = 5000

/**
 * Sanitize message content to prevent stored XSS.
 * Uses sanitize-html to strip all tags reliably (regex is bypassable).
 */
function sanitizeMessageContent(content) {
  return sanitizeHtml(String(content), { allowedTags: [], allowedAttributes: {} }).trim()
}

/**
 * Verify the requesting user is a participant in the conversation that
 * contains the given message. Returns { message, participant } on success,
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

module.exports = {
  MAX_MESSAGE_LENGTH,
  sanitizeMessageContent,
  verifyMessageParticipant,
}
