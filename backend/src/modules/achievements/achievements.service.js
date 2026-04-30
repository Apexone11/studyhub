/**
 * achievements.service.js — read-side queries that power the gallery,
 * detail page, profile widgets, and the level chip.
 */

const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { BADGE_CATALOG: _BADGE_CATALOG, levelProgressForXp } = require('./achievements.constants')

async function getCatalog({ viewerId, includeSecretLocked = false } = {}) {
  const all = await prisma.badge.findMany({
    orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { tier: 'asc' }],
  })

  let heldMap = new Map()
  if (viewerId) {
    const held = await prisma.userBadge.findMany({
      where: { userId: viewerId },
      select: { badgeId: true, unlockedAt: true, pinned: true, pinOrder: true, sharedAt: true },
    })
    heldMap = new Map(held.map((ub) => [ub.badgeId, ub]))
  }

  return all
    .filter((b) => {
      if (b.isSecret && !heldMap.has(b.id) && !includeSecretLocked) return false
      return true
    })
    .map((b) => serializeBadge(b, heldMap.get(b.id) || null))
}

async function getUserAchievements({ targetUserId, viewerId: _viewerId, isOwner }) {
  const all = await prisma.badge.findMany({
    orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { tier: 'asc' }],
  })
  const held = await prisma.userBadge.findMany({
    where: { userId: targetUserId },
    select: { badgeId: true, unlockedAt: true, pinned: true, pinOrder: true, sharedAt: true },
  })
  const heldMap = new Map(held.map((ub) => [ub.badgeId, ub]))

  return all
    .filter((b) => !b.isSecret || heldMap.has(b.id))
    .map((b) => serializeBadge(b, heldMap.get(b.id) || null, { ownerView: isOwner }))
}

async function getUserStats(userId) {
  if (!userId) return null
  let stats = await prisma.userAchievementStats.findUnique({ where: { userId } })
  if (!stats) {
    const held = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { xp: true, tier: true } } },
    })
    const totalXp = held.reduce((s, ub) => s + (ub.badge?.xp || 0), 0)
    const progress = levelProgressForXp(totalXp)
    return {
      userId,
      totalXp,
      level: progress.currentLevel,
      unlockedCount: held.length,
      highestTier: 'bronze',
      achievementsHidden: false,
      currentLevelMinXp: progress.currentLevelMinXp,
      nextLevel: progress.nextLevel,
      nextLevelMinXp: progress.nextLevelMinXp,
    }
  }
  const progress = levelProgressForXp(stats.totalXp)
  return {
    userId,
    totalXp: stats.totalXp,
    level: progress.currentLevel,
    unlockedCount: stats.unlockedCount,
    highestTier: stats.highestTier,
    achievementsHidden: Boolean(stats.achievementsHidden),
    currentLevelMinXp: progress.currentLevelMinXp,
    nextLevel: progress.nextLevel,
    nextLevelMinXp: progress.nextLevelMinXp,
  }
}

async function getBadge({ slug, viewerId }) {
  const badge = await prisma.badge.findUnique({ where: { slug } })
  if (!badge) return null

  let viewerHeld = null
  if (viewerId) {
    viewerHeld = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId: viewerId, badgeId: badge.id } },
      select: { unlockedAt: true, pinned: true, pinOrder: true, sharedAt: true },
    })
  }

  let holderCount = 0
  let totalUsers = 0
  try {
    const [holders, users] = await Promise.all([
      prisma.userBadge.count({ where: { badgeId: badge.id } }),
      prisma.user.count(),
    ])
    holderCount = holders
    totalUsers = users
  } catch (error) {
    captureError(error, { source: 'achievements.getBadge.stats', slug })
  }

  // Loop-2 finding F-D: secret-badge unlockers list is only visible to other
  // holders. Otherwise a non-holder querying the detail page could deduce
  // the unlock condition from the timestamps in the list.
  const canSeeRecents = !badge.isSecret || Boolean(viewerHeld)

  let recentUnlockers = []
  if (canSeeRecents) {
    try {
      const recents = await prisma.userBadge.findMany({
        where: { badgeId: badge.id },
        orderBy: { unlockedAt: 'desc' },
        take: 25,
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true, isPrivate: true },
          },
        },
      })
      let blockedIds = []
      if (viewerId) {
        try {
          const blockFilter = require('../../lib/social/blockFilter')
          blockedIds = await blockFilter.getBlockedUserIds(prisma, viewerId)
        } catch {
          blockedIds = []
        }
      }
      const hiddenSet = new Set()
      try {
        const hidden = await prisma.userAchievementStats.findMany({
          where: { userId: { in: recents.map((r) => r.userId) }, achievementsHidden: true },
          select: { userId: true },
        })
        for (const h of hidden) hiddenSet.add(h.userId)
      } catch {
        /* hidden flag table missing — degrade silently */
      }
      recentUnlockers = recents
        .filter((r) => !blockedIds.includes(r.userId))
        .filter((r) => !hiddenSet.has(r.userId))
        .filter((r) => !r.user.isPrivate)
        .slice(0, 10)
        .map((r) => ({
          userId: r.user.id,
          username: r.user.username,
          avatarUrl: r.user.avatarUrl || null,
          unlockedAt: r.unlockedAt.toISOString(),
        }))
    } catch (error) {
      captureError(error, { source: 'achievements.getBadge.recents', slug })
    }
  }

  return {
    ...serializeBadge(badge, viewerHeld),
    holderCount,
    totalUsers,
    recentUnlockers,
  }
}

async function setPinned({ userId, slug, pinned }) {
  const badge = await prisma.badge.findUnique({ where: { slug }, select: { id: true } })
  if (!badge) return { error: 'NOT_FOUND' }
  const ub = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
    select: { id: true },
  })
  if (!ub) return { error: 'NOT_OWNED' }

  if (pinned) {
    const current = await prisma.userBadge.findMany({
      where: { userId, pinned: true },
      orderBy: { pinOrder: 'asc' },
      select: { id: true, pinOrder: true },
    })
    if (current.length >= 6 && !current.some((c) => c.id === ub.id)) {
      return { error: 'MAX_PINNED' }
    }
    const nextOrder = current.length === 0 ? 1 : (current[current.length - 1].pinOrder || 0) + 1
    await prisma.userBadge.update({
      where: { id: ub.id },
      data: { pinned: true, pinOrder: nextOrder },
    })
  } else {
    await prisma.userBadge.update({
      where: { id: ub.id },
      data: { pinned: false, pinOrder: null },
    })
  }
  return { ok: true }
}

async function setAchievementsHidden({ userId, hidden }) {
  await prisma.userAchievementStats.upsert({
    where: { userId },
    create: { userId, achievementsHidden: Boolean(hidden) },
    update: { achievementsHidden: Boolean(hidden) },
  })
  return { ok: true }
}

/**
 * Serialize a Badge row for API output. Combines catalog metadata with the
 * viewer's per-user state when a UserBadge row is provided.
 *
 * Loop-2 finding F-B: when a badge is `secret` and the viewer does NOT hold
 * it, we strip the name / description / iconSlug / threshold from the
 * response so a curious authenticated viewer cannot read the badge title
 * out of the JSON in DevTools. The hexagon and "Secret" placeholder render
 * from `tier` alone.
 */
function serializeBadge(badge, userBadge, opts = {}) {
  const isUnlocked = Boolean(userBadge)
  const hideSecretMeta = badge.isSecret && !isUnlocked
  return {
    slug: badge.slug,
    name: hideSecretMeta ? 'Secret' : badge.name,
    description: hideSecretMeta ? 'Unlock this achievement to reveal it.' : badge.description,
    category: badge.category,
    tier: badge.tier,
    iconSlug: hideSecretMeta ? null : badge.iconSlug || null,
    iconUrl: hideSecretMeta ? null : badge.iconUrl || null,
    threshold: hideSecretMeta ? null : badge.threshold,
    xp: badge.xp,
    isSecret: Boolean(badge.isSecret),
    displayOrder: badge.displayOrder,
    isUnlocked,
    unlockedAt: userBadge ? userBadge.unlockedAt.toISOString() : null,
    pinned: userBadge ? Boolean(userBadge.pinned) : false,
    pinOrder: userBadge ? userBadge.pinOrder || null : null,
    sharedAt: userBadge && userBadge.sharedAt ? userBadge.sharedAt.toISOString() : null,
    ...(opts.ownerView ? { ownerView: true } : {}),
  }
}

module.exports = {
  getCatalog,
  getUserAchievements,
  getUserStats,
  getBadge,
  setPinned,
  setAchievementsHidden,
}
