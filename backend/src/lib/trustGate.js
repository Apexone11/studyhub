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

const PROMOTION_MIN_AGE_DAYS = 7

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
 *
 * @param {{ trustLevel: string, role?: string }} user
 * @returns {'clean' | 'pending_review'}
 */
function getInitialModerationStatus(user) {
  return shouldAutoPublish(user) ? 'clean' : 'pending_review'
}

/**
 * Pure function — evaluates whether a user meets the criteria for promotion
 * to the 'trusted' trust level.
 *
 * @param {object} params
 * @param {Date}    params.createdAt            — account creation timestamp
 * @param {number}  params.confirmedViolations  — count of confirmed moderation violations
 * @param {number}  params.activeStrikes        — count of currently active strikes
 * @param {boolean} params.hasActiveRestriction — whether the user has an active restriction
 * @returns {boolean}
 */
function meetsPromotionCriteria({ createdAt, confirmedViolations, activeStrikes, hasActiveRestriction }) {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  if (ageDays < PROMOTION_MIN_AGE_DAYS) return false
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
    select: { id: true, trustLevel: true, createdAt: true },
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
    createdAt: user.createdAt,
    confirmedViolations,
    activeStrikes,
    hasActiveRestriction: activeRestriction,
  })

  if (!eligible) return { promoted: false, trustLevel: user.trustLevel }

  await prisma.user.update({
    where: { id: userId },
    data: {
      trustLevel: TRUST_LEVELS.TRUSTED,
      trustedAt: new Date(),
    },
  })

  return { promoted: true, trustLevel: TRUST_LEVELS.TRUSTED }
}

module.exports = {
  TRUST_LEVELS,
  PROMOTION_MIN_AGE_DAYS,
  shouldAutoPublish,
  getInitialModerationStatus,
  meetsPromotionCriteria,
  checkAndPromoteTrust,
}
