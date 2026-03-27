const prisma = require('./prisma')

/**
 * Write a moderation audit log entry.
 * Fire-and-forget — never throws, never blocks callers.
 *
 * @param {object} params
 * @param {number|null} params.userId - User the event relates to
 * @param {string} params.action - Action type (e.g. 'strike.issued', 'appeal.approved')
 * @param {number|null} params.caseId - Related moderation case ID
 * @param {number|null} params.strikeId - Related strike ID
 * @param {number|null} params.appealId - Related appeal ID
 * @param {string|null} params.contentType - Type of content involved (e.g. 'sheet', 'comment')
 * @param {number|null} params.contentId - ID of the content involved
 * @param {string|null} params.reason - Human-readable reason for the action
 * @param {number|null} params.performedBy - Admin/moderator user ID who performed the action
 * @param {object|null} params.metadata - Additional structured metadata
 */
async function logModerationEvent({
  userId,
  action,
  caseId = null,
  strikeId = null,
  appealId = null,
  contentType = null,
  contentId = null,
  reason = null,
  performedBy = null,
  metadata = null,
}) {
  try {
    await prisma.moderationLog.create({
      data: {
        userId,
        action,
        caseId,
        strikeId,
        appealId,
        contentType,
        contentId,
        reason,
        performedBy,
        metadata,
      },
    })
  } catch (err) {
    // Best-effort — never throw from logger
    console.error('[moderation-log] Failed to write log entry:', err.message)
  }
}

module.exports = { logModerationEvent }
