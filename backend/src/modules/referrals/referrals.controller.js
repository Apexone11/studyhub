/**
 * referrals.controller.js -- HTTP handlers for the referral module.
 */

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const log = require('../../lib/logger')
const service = require('./referrals.service')
const { VALID_CHANNELS, MAX_INVITES_PER_REQUEST } = require('./referrals.constants')

async function getMyReferrals(req, res) {
  try {
    const data = await service.getMyReferrals(req.user.userId)
    res.json(data)
  } catch (err) {
    log.error({ err }, 'Failed to get referral data')
    sendError(res, 500, 'Failed to load referral data.', ERROR_CODES.INTERNAL)
  }
}

async function sendInvites(req, res) {
  try {
    const { emails } = req.body || {}

    if (!Array.isArray(emails) || emails.length === 0) {
      return sendError(res, 400, 'Provide an array of email addresses.', ERROR_CODES.VALIDATION)
    }
    if (emails.length > MAX_INVITES_PER_REQUEST) {
      return sendError(
        res,
        400,
        `You can send at most ${MAX_INVITES_PER_REQUEST} invites at a time.`,
        ERROR_CODES.VALIDATION,
      )
    }

    // Resolve inviter username for the email template
    const prisma = require('../../lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { username: true },
    })
    const username = user?.username || 'A StudyHub user'

    const results = await service.sendInvites(req.user.userId, emails, username)
    res.json({ results })
  } catch (err) {
    log.error({ err }, 'Failed to send referral invites')
    sendError(res, 500, 'Failed to send invites.', ERROR_CODES.INTERNAL)
  }
}

async function trackShare(req, res) {
  try {
    const { channel } = req.body || {}

    if (!channel || !VALID_CHANNELS.includes(channel)) {
      return sendError(
        res,
        400,
        `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}.`,
        ERROR_CODES.VALIDATION,
      )
    }
    if (channel === 'email') {
      return sendError(
        res,
        400,
        'Use the /invite endpoint for email invites.',
        ERROR_CODES.VALIDATION,
      )
    }

    await service.trackShare(req.user.userId, channel)
    res.json({ tracked: true })
  } catch (err) {
    log.error({ err }, 'Failed to track share')
    sendError(res, 500, 'Failed to track share.', ERROR_CODES.INTERNAL)
  }
}

async function resolveCode(req, res) {
  try {
    const result = await service.resolveCode(req.params.code)
    res.json(result)
  } catch (err) {
    log.error({ err }, 'Failed to resolve referral code')
    sendError(res, 500, 'Failed to resolve code.', ERROR_CODES.INTERNAL)
  }
}

module.exports = { getMyReferrals, sendInvites, trackShare, resolveCode }
