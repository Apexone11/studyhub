/* ═══════════════════════════════════════════════════════════════════════════
 * trustGate.js — Centralized trust-level helpers for StudyHub
 *
 * Provides constants, pure logic helpers, and a DB-aware promotion checker
 * for the S-9 Trust Levels feature.
 *
 * Pure functions (no DB):
 *   shouldAutoPublish(user)
 *   getInitialModerationStatus(user)
 *   meetsPromotionCriteria({ createdAt, confirmedViolations, activeStrikes, hasActiveRestriction })
 *
 * DB-aware:
 *   checkAndPromoteTrust(userId)
 * ═══════════════════════════════════════════════════════════════════════════ */

const TRUST_LEVELS = {
  NEW: 'new',
  TRUSTED: 'trusted',
  RESTRICTED: 'restricted',
}

/**
 * Returns true if the user's content should bypass the moderation queue
 * and be published immediately.
 *
 * Trusted users and admins auto-publish.
 *
 * @param {{ trustLevel: string, role?: string }} user
 * @returns {boolean}
 */
function shouldAutoPublish(user) {
  if (user.role === 'admin') return true
  return user.trustLevel === TRUST_LEVELS.TRUSTED
}

/**
 * Returns the initial moderation status string for newly created content.
 * All content publishes immediately — moderation gating is disabled.
 *
 * @param {{ trustLevel: string, role?: string }} user
 * @returns {'clean'}
 */
function getInitialModerationStatus(_user) {
  return 'clean'
}

/**
 * Pure function — evaluates whether a user meets the criteria for promotion
 * to the 'trusted' trust level.
 *
 * Rule: trusted = has email + clean moderation history.
 * Accounts with an email address are auto-trusted as long as they have no
 * active strikes, restrictions, or confirmed violations.
 *
 * @param {object} params
 * @param {boolean} params.hasEmail             — whether the user has an email on file
 * @param {number}  params.confirmedViolations  — count of confirmed moderation violations
 * @param {number}  params.activeStrikes        — count of currently active strikes
 * @param {boolean} params.hasActiveRestriction — whether the user has an active restriction
 * @returns {boolean}
 */
function meetsPromotionCriteria({ hasEmail, confirmedViolations, activeStrikes, hasActiveRestriction }) {
  if (!hasEmail) return false
  if (confirmedViolations > 0) return false
  if (activeStrikes > 0) return false
  if (hasActiveRestriction) return false

  return true
}

/**
 * DB-aware promotion check. Fetches the user record, current strike count,
 * active restriction status, and confirmed moderation case count. Promotes
 * the user to 'trusted' and sets trustedAt if all criteria are met.
 *
 * Safe to call repeatedly — exits early if the user is already trusted or
 * restricted.
 *
 * @param {number} userId
 * @returns {Promise<{ promoted: boolean, trustLevel: string }>}
 */
async function checkAndPromoteTrust(userId) {
  const prisma = require('./prisma')
  const { countActiveStrikes, hasActiveRestriction } = require('./moderation/moderationEngine')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, trustLevel: true, email: true },
  })

  if (!user) return { promoted: false, trustLevel: null }

  // Already at a terminal state — nothing to do.
  if (user.trustLevel === TRUST_LEVELS.TRUSTED) return { promoted: false, trustLevel: TRUST_LEVELS.TRUSTED }
  if (user.trustLevel === TRUST_LEVELS.RESTRICTED) return { promoted: false, trustLevel: TRUST_LEVELS.RESTRICTED }

  const [activeStrikes, activeRestriction, confirmedViolations] = await Promise.all([
    countActiveStrikes(userId),
    hasActiveRestriction(userId),
    prisma.moderationCase.count({
      where: {
        userId,
        status: 'confirmed',
      },
    }),
  ])

  const eligible = meetsPromotionCriteria({
    hasEmail: Boolean(user.email),
    confirmedViolations,
    activeStrikes,
    hasActiveRestriction: activeRestriction,
  })

  if (!eligible) return { promoted: false, trustLevel: user.trustLevel }

  // Promote user and upgrade all their pending content to clean
  await Promise.all([
    prisma.user.update({
      where: { id: userId },
      data: {
        trustLevel: TRUST_LEVELS.TRUSTED,
        trustedAt: new Date(),
      },
    }),
    prisma.feedPost.updateMany({
      where: { userId, moderationStatus: 'pending_review' },
      data: { moderationStatus: 'clean' },
    }),
    prisma.feedPostComment.updateMany({
      where: { userId, moderationStatus: 'pending_review' },
      data: { moderationStatus: 'clean' },
    }),
    prisma.note.updateMany({
      where: { userId, moderationStatus: 'pending_review' },
      data: { moderationStatus: 'clean' },
    }),
  ])

  return { promoted: true, trustLevel: TRUST_LEVELS.TRUSTED }
}

module.exports = {
  TRUST_LEVELS,
  shouldAutoPublish,
  getInitialModerationStatus,
  meetsPromotionCriteria,
  checkAndPromoteTrust,
}
