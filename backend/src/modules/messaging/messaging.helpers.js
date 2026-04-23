/**
 * messaging.helpers.js — Shared messaging helpers and utilities
 *
 * These functions are used by multiple messaging route modules.
 */

const sanitizeHtml = require('sanitize-html')
const prisma = require('../../lib/prisma')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

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
    sendError(res, 404, 'Message not found.', ERROR_CODES.NOT_FOUND)
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
    sendError(res, 404, 'Message not found.', ERROR_CODES.NOT_FOUND)
    return null
  }

  return { message, participant }
}

/**
 * Check if two users mutually follow each other with active status.
 * Returns true if both A follows B and B follows A (both with status 'active').
 */
async function areMutualFollowers(userIdA, userIdB) {
  const [aFollowsB, bFollowsA] = await Promise.all([
    prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: userIdA, followingId: userIdB } },
    }),
    prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: userIdB, followingId: userIdA } },
    }),
  ])

  return aFollowsB && aFollowsB.status === 'active' && bFollowsA && bFollowsA.status === 'active'
}

/**
 * Standard shape for formatting a conversation list item from a
 * ConversationParticipant record that includes the full conversation.
 */
function formatConversationItem(cp) {
  return {
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
    archived: cp.archived,
    status: cp.status,
    lastReadAt: cp.lastReadAt,
    createdAt: cp.conversation.createdAt,
    updatedAt: cp.conversation.updatedAt,
  }
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  sanitizeMessageContent,
  verifyMessageParticipant,
  areMutualFollowers,
  formatConversationItem,
}
