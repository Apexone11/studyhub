/**
 * referrals.service.js -- Core referral business logic.
 *
 * Handles code generation, invite sending, referral attribution,
 * and milestone-based reward granting.
 *
 * Security invariants:
 * - Code generation uses crypto.randomBytes(), never Math.random()
 * - Self-referral detection via IP comparison (silently accepted, not counted)
 * - One inviter per invitee (first-wins via referredByUserId null check)
 * - Duplicate email suppression within 24 hours
 * - Reward idempotency via @@unique([userId, milestone]) + transaction
 * - proRewardExpiresAt only set by reward transaction, never user input
 */

const crypto = require('node:crypto')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { EVENTS, trackServerEvent } = require('../../lib/events')
const { sendReferralInvite } = require('../../lib/email/emailTemplates')
const { MILESTONES, CODE_CHARS, CODE_LENGTH } = require('./referrals.constants')

// Basic email regex -- rejects obviously invalid formats
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Stable, non-reversible identifier for correlating invite retries without
// logging raw PII. Last 8 hex chars of sha256 — collision-resistant enough
// for log correlation, irreversible for compliance.
function hashEmail(email) {
  if (!email) return null
  return crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(-8)
}

/**
 * Generate a cryptographically random referral code.
 * Maps random bytes to CODE_CHARS to avoid ambiguous characters.
 */
function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  }
  return code
}

/**
 * Get user's referral code. If null, generate one and persist it.
 * Retries up to 3 times on uniqueness constraint collision.
 */
async function getOrCreateCode(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  })
  if (user?.referralCode) return user.referralCode

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode()
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      })
      return updated.referralCode
    } catch (err) {
      // Unique constraint violation -- retry with new code
      if (err.code === 'P2002') continue
      throw err
    }
  }
  throw new Error('Failed to generate unique referral code after 3 attempts')
}

/**
 * Return the authenticated user's referral dashboard data.
 */
async function getMyReferrals(userId) {
  const code = await getOrCreateCode(userId)

  const [sentCount, acceptedCount, pendingCount, recentInvites, rewards] = await Promise.all([
    prisma.referral.count({ where: { inviterId: userId } }),
    prisma.referral.count({ where: { inviterId: userId, NOT: [{ acceptedAt: null }] } }),
    prisma.referral.count({ where: { inviterId: userId, acceptedAt: null } }),
    prisma.referral.findMany({
      where: { inviterId: userId },
      orderBy: { sentAt: 'desc' },
      take: 20,
      select: {
        id: true,
        email: true,
        channel: true,
        sentAt: true,
        acceptedAt: true,
        invitedUser: { select: { id: true, username: true, avatarUrl: true } },
      },
    }),
    prisma.referralReward.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      select: { milestone: true, proMonths: true, badgeKey: true, grantedAt: true },
    }),
  ])

  // Determine next milestone
  const claimedThresholds = new Set(rewards.map((r) => r.milestone))
  const nextMilestone = MILESTONES.find((m) => !claimedThresholds.has(m.threshold)) || null

  return {
    code,
    stats: { sent: sentCount, accepted: acceptedCount, pending: pendingCount },
    recentInvites,
    rewards,
    nextMilestone: nextMilestone
      ? {
          threshold: nextMilestone.threshold,
          proMonths: nextMilestone.proMonths,
          remaining: nextMilestone.threshold - acceptedCount,
        }
      : null,
  }
}

/**
 * Send email invites from an authenticated user.
 * Validates emails, deduplicates within 24h, creates Referral rows, and sends emails.
 */
async function sendInvites(userId, emails, inviterUsername) {
  const code = await getOrCreateCode(userId)
  const results = []
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  for (const rawEmail of emails) {
    const email = String(rawEmail || '')
      .trim()
      .toLowerCase()

    // Validate format
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'invalid_format' })
      continue
    }

    // Check for duplicate invite within 24h (same inviter + same email)
    try {
      const existing = await prisma.referral.findFirst({
        where: {
          inviterId: userId,
          email,
          sentAt: { gte: oneDayAgo },
        },
        select: { id: true },
      })
      if (existing) {
        results.push({ email, status: 'duplicate' })
        continue
      }
    } catch {
      // Graceful degradation -- proceed with send
    }

    // Create Referral row
    try {
      await prisma.referral.create({
        data: {
          inviterId: userId,
          code,
          email,
          channel: 'email',
        },
      })

      // Send invite email (best-effort).
      // PII rule: never log a raw invitee email. Hash to a stable
      // identifier (last 8 hex chars of sha256) for correlating retries
      // without persisting plaintext PII to log aggregators.
      try {
        await sendReferralInvite(email, inviterUsername, code)
      } catch (emailErr) {
        log.warn(
          {
            event: 'referral.invite_email_failed',
            err: emailErr.message,
            emailHash: hashEmail(email),
          },
          'Failed to send referral invite email',
        )
      }

      trackServerEvent(userId, EVENTS.REFERRAL_SENT, { channel: 'email' })
      results.push({ email, status: 'sent' })
    } catch (err) {
      log.warn(
        {
          event: 'referral.invite_create_failed',
          err: err.message,
          emailHash: hashEmail(email),
        },
        'Failed to create referral invite',
      )
      results.push({ email, status: 'error' })
    }
  }

  return results
}

/**
 * Track a share action (link copy, link share) for K-factor analytics.
 */
async function trackShare(userId, channel) {
  const code = await getOrCreateCode(userId)
  await prisma.referral.create({
    data: {
      inviterId: userId,
      code,
      channel,
    },
  })
  trackServerEvent(userId, EVENTS.REFERRAL_SENT, { channel })
}

/**
 * Public. Resolve a referral code to inviter info.
 */
async function resolveCode(code) {
  if (!code || typeof code !== 'string' || code.length !== CODE_LENGTH) {
    return { valid: false }
  }

  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { username: true, avatarUrl: true },
  })

  if (!user) return { valid: false }
  return { valid: true, inviterUsername: user.username, inviterAvatarUrl: user.avatarUrl }
}

/**
 * Called during registration to attach a referral.
 *
 * Security:
 * - Self-referral detection: compares new user IP to inviter's most recent audit log IP.
 *   If matched, the Referral row is created but acceptedAt is NOT set (does not count).
 * - First-wins: referredByUserId is only set if currently null.
 */
async function attachReferral(code, newUserId, registrationIp) {
  if (!code || typeof code !== 'string') return

  // Find inviter by code
  const inviter = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  })
  if (!inviter) return

  // Cannot refer yourself
  if (inviter.id === newUserId) return

  // Self-referral IP check: query inviter's most recent audit log entry for their IP
  let isSelfReferral = false
  if (registrationIp) {
    try {
      const recentAudit = await prisma.auditLog.findFirst({
        where: { actorId: inviter.id },
        orderBy: { createdAt: 'desc' },
        select: { ipAddress: true },
      })
      if (recentAudit?.ipAddress && recentAudit.ipAddress === registrationIp) {
        isSelfReferral = true
      }
    } catch {
      // Audit table may not exist -- skip check
    }
  }

  if (isSelfReferral) {
    // Create the row for record-keeping but do NOT set acceptedAt
    try {
      await prisma.referral.create({
        data: {
          inviterId: inviter.id,
          code,
          channel: 'link',
          invitedUserId: newUserId,
          // acceptedAt deliberately omitted -- does not count toward rewards
        },
      })
    } catch {
      // best-effort
    }
    return
  }

  // Legitimate referral
  try {
    // Set referredByUserId only if currently null (first-wins)
    const currentUser = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { referredByUserId: true },
    })
    if (currentUser && currentUser.referredByUserId === null) {
      await prisma.user.update({
        where: { id: newUserId },
        data: { referredByUserId: inviter.id },
      })
    }

    // Find or create matching Referral row and set invitedUserId + acceptedAt
    const existingReferral = await prisma.referral.findFirst({
      where: {
        inviterId: inviter.id,
        code,
        invitedUserId: null,
      },
      orderBy: { sentAt: 'desc' },
      select: { id: true },
    })

    if (existingReferral) {
      await prisma.referral.update({
        where: { id: existingReferral.id },
        data: { invitedUserId: newUserId, acceptedAt: new Date() },
      })
    } else {
      await prisma.referral.create({
        data: {
          inviterId: inviter.id,
          code,
          channel: 'link',
          invitedUserId: newUserId,
          acceptedAt: new Date(),
        },
      })
    }

    trackServerEvent(newUserId, EVENTS.REFERRAL_ACCEPTED, { inviterId: inviter.id })

    // Check and grant milestones (best-effort, non-blocking)
    checkAndGrantMilestones(inviter.id).catch((err) => {
      log.warn({ err, userId: inviter.id }, 'Failed to check referral milestones')
    })
  } catch (err) {
    log.warn({ err, code, newUserId }, 'Failed to attach referral')
  }
}

/**
 * Check milestone thresholds and grant rewards inside a transaction.
 * The @@unique([userId, milestone]) constraint prevents double-grants.
 */
async function checkAndGrantMilestones(userId) {
  await prisma.$transaction(async (tx) => {
    // Count accepted referrals
    const acceptedCount = await tx.referral.count({
      where: { inviterId: userId, NOT: [{ acceptedAt: null }] },
    })

    // Find already-claimed milestones
    const claimed = await tx.referralReward.findMany({
      where: { userId },
      select: { milestone: true },
    })
    const claimedSet = new Set(claimed.map((r) => r.milestone))

    for (const milestone of MILESTONES) {
      if (acceptedCount < milestone.threshold) continue
      if (claimedSet.has(milestone.threshold)) continue

      // Grant reward
      await tx.referralReward.create({
        data: {
          userId,
          milestone: milestone.threshold,
          proMonths: milestone.proMonths,
          badgeKey: milestone.badgeKey,
        },
      })

      // Extend proRewardExpiresAt
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { proRewardExpiresAt: true },
      })

      const now = new Date()
      const baseDate =
        user?.proRewardExpiresAt && new Date(user.proRewardExpiresAt) > now
          ? new Date(user.proRewardExpiresAt)
          : now

      const newExpiry = new Date(baseDate)
      newExpiry.setMonth(newExpiry.getMonth() + milestone.proMonths)

      await tx.user.update({
        where: { id: userId },
        data: { proRewardExpiresAt: newExpiry },
      })

      trackServerEvent(userId, EVENTS.REFERRAL_REWARD_GRANTED, {
        milestone: milestone.threshold,
        proMonths: milestone.proMonths,
        badgeKey: milestone.badgeKey,
      })
    }
  })
}

module.exports = {
  generateCode,
  getOrCreateCode,
  getMyReferrals,
  sendInvites,
  trackShare,
  resolveCode,
  attachReferral,
  checkAndGrantMilestones,
}
