/**
 * rolePersonalization.js — boost-input resolver for ranking helpers.
 *
 * Returns the IDs that personalize feed/search ranking for a given user.
 * For students/teachers it's the enrolled course IDs. For Self-learners
 * (accountType === 'other') it's the followed hashtag IDs. Same ranker,
 * different input set — see docs/internal/roles-and-permissions-plan.md §6.5/§10.2.
 *
 * The shape is `{ kind: 'course' | 'hashtag', ids: number[] }` so callers
 * can branch their own scoring logic if needed (e.g., joining `Sheet.courseId`
 * vs. a future `Sheet.hashtags` table). Errors degrade gracefully to an
 * empty list — ranking falls back to the unboosted base score, never throws.
 */

const prismaDefault = require('./prisma')
const { captureError } = require('../monitoring/sentry')

const SELF_LEARNER = 'other'

async function getCourseIds(prisma, userId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    select: { courseId: true },
  })
  return enrollments.map((e) => e.courseId)
}

async function getHashtagIds(prisma, userId) {
  const follows = await prisma.hashtagFollow.findMany({
    where: { userId },
    select: { hashtagId: true },
  })
  return follows.map((f) => f.hashtagId)
}

/**
 * @param {{ id: number, accountType?: string }} user
 * @param {{ prisma?: object }} [opts]
 * @returns {Promise<{ kind: 'course' | 'hashtag', ids: number[] }>}
 */
async function getBoostedIdsForUser(user, opts = {}) {
  const prisma = opts.prisma || prismaDefault
  if (!user || typeof user.id !== 'number') {
    return { kind: 'course', ids: [] }
  }

  const isSelfLearner = user.accountType === SELF_LEARNER
  const kind = isSelfLearner ? 'hashtag' : 'course'

  try {
    const ids = isSelfLearner
      ? await getHashtagIds(prisma, user.id)
      : await getCourseIds(prisma, user.id)
    return { kind, ids }
  } catch (err) {
    captureError(err, { where: 'getBoostedIdsForUser', userId: user.id, kind })
    return { kind, ids: [] }
  }
}

module.exports = {
  getBoostedIdsForUser,
  SELF_LEARNER_ACCOUNT_TYPE: SELF_LEARNER,
}
