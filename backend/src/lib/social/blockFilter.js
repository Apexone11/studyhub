/**
 * blockFilter.js — Shared helpers for filtering blocked users from queries.
 *
 * Usage:
 *   const { getBlockedUserIds, blockFilterClause } = require('../../lib/social/blockFilter')
 *
 *   // Get IDs to exclude
 *   const blockedIds = await getBlockedUserIds(prisma, userId)
 *
 *   // Or get a Prisma WHERE clause fragment
 *   const clause = await blockFilterClause(prisma, userId, 'authorId')
 */

/**
 * Returns an array of user IDs that the given user has blocked OR is blocked by.
 * Both directions must be filtered — if A blocks B, neither should see the other.
 */
async function getBlockedUserIds(prisma, userId) {
  if (!userId) return []

  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    }),
    prisma.userBlock.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    }),
  ])

  const ids = new Set()
  for (const row of blockedByMe) ids.add(row.blockedId)
  for (const row of blockedMe) ids.add(row.blockerId)
  return Array.from(ids)
}

/**
 * Returns an array of user IDs that the given user has muted.
 * One-directional — only the muter's view is affected.
 */
async function getMutedUserIds(prisma, userId) {
  if (!userId) return []

  const muted = await prisma.userMute.findMany({
    where: { muterId: userId },
    select: { mutedId: true },
  })

  return muted.map((row) => row.mutedId)
}

/**
 * Returns a Prisma NOT-IN clause to filter a given user-field by blocked IDs.
 * Returns {} if no blocks exist (no filtering needed).
 *
 * @param {object} prisma
 * @param {number|null} userId - requesting user's ID (null = unauthenticated)
 * @param {string} field - the field name to filter (e.g. 'userId', 'authorId')
 * @returns {object} Prisma where clause fragment, e.g. { authorId: { notIn: [3, 7] } }
 */
async function blockFilterClause(prisma, userId, field) {
  const blockedIds = await getBlockedUserIds(prisma, userId)
  if (blockedIds.length === 0) return {}
  return { [field]: { notIn: blockedIds } }
}

/**
 * Check if user A has blocked user B (one direction only).
 */
async function hasBlocked(prisma, blockerId, blockedId) {
  const block = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  })
  return !!block
}

/**
 * Check if either user has blocked the other (bidirectional).
 */
async function isBlockedEitherWay(prisma, userA, userB) {
  const [aBlocksB, bBlocksA] = await Promise.all([
    hasBlocked(prisma, userA, userB),
    hasBlocked(prisma, userB, userA),
  ])
  return aBlocksB || bBlocksA
}

module.exports = {
  getBlockedUserIds,
  getMutedUserIds,
  blockFilterClause,
  hasBlocked,
  isBlockedEitherWay,
}
