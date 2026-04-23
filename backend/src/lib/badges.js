/**
 * badges.js — Badge catalog + unlock engine
 *
 * 15 badges across 4 categories: studying, building, collaboration, and streaks.
 * Server-side unlock logic checks user stats and awards badges.
 */
const { captureError } = require('../monitoring/sentry')
const { getUserStreak } = require('./streaks')

/**
 * Badge catalog — defines all available badges.
 * Each slug must match the Badge.slug in the database.
 */
const BADGE_CATALOG = [
  // ── Studying category ───────────────────────────────────────
  {
    slug: 'first-sheet',
    name: 'First Sheet',
    description: 'Upload your first study sheet',
    category: 'studying',
    tier: 'bronze',
    threshold: 1,
  },
  {
    slug: 'prolific-writer',
    name: 'Prolific Writer',
    description: 'Upload 10 study sheets',
    category: 'studying',
    tier: 'silver',
    threshold: 10,
  },
  {
    slug: 'study-machine',
    name: 'Study Machine',
    description: 'Upload 50 study sheets',
    category: 'studying',
    tier: 'gold',
    threshold: 50,
  },
  {
    slug: 'first-star',
    name: 'First Star',
    description: 'Get your first star on a sheet',
    category: 'studying',
    tier: 'bronze',
    threshold: 1,
  },

  // ── Building category ───────────────────────────────────────
  {
    slug: 'first-fork',
    name: 'First Fork',
    description: 'Fork your first study sheet',
    category: 'building',
    tier: 'bronze',
    threshold: 1,
  },
  {
    slug: 'fork-master',
    name: 'Fork Master',
    description: 'Fork 10 study sheets',
    category: 'building',
    tier: 'silver',
    threshold: 10,
  },
  {
    slug: 'first-commit',
    name: 'First Commit',
    description: 'Create your first commit in SheetLab',
    category: 'building',
    tier: 'bronze',
    threshold: 1,
  },
  {
    slug: 'commit-streak',
    name: 'Commit Streak',
    description: 'Make 50 commits',
    category: 'building',
    tier: 'gold',
    threshold: 50,
  },

  // ── Collaboration category ──────────────────────────────────
  {
    slug: 'first-contribution',
    name: 'First Contribution',
    description: 'Submit your first contribution',
    category: 'collaboration',
    tier: 'bronze',
    threshold: 1,
  },
  {
    slug: 'helpful-reviewer',
    name: 'Helpful Reviewer',
    description: 'Review 5 contributions',
    category: 'collaboration',
    tier: 'silver',
    threshold: 5,
  },
  {
    slug: 'community-star',
    name: 'Community Star',
    description: 'Get 25 total stars across all sheets',
    category: 'collaboration',
    tier: 'gold',
    threshold: 25,
  },
  {
    slug: 'first-follower',
    name: 'First Follower',
    description: 'Get your first follower',
    category: 'collaboration',
    tier: 'bronze',
    threshold: 1,
  },

  // ── Streaks category ────────────────────────────────────────
  {
    slug: 'streak-3',
    name: '3-Day Streak',
    description: '3-day study streak',
    category: 'streaks',
    tier: 'bronze',
    threshold: 3,
  },
  {
    slug: 'streak-7',
    name: '7-Day Streak',
    description: '7-day study streak',
    category: 'streaks',
    tier: 'silver',
    threshold: 7,
  },
  {
    slug: 'streak-30',
    name: '30-Day Streak',
    description: '30-day study streak',
    category: 'streaks',
    tier: 'gold',
    threshold: 30,
  },
]

/**
 * Ensure all badge definitions exist in the database.
 * Called once at server startup.
 */
async function seedBadgeCatalog(prisma) {
  try {
    for (const badge of BADGE_CATALOG) {
      await prisma.badge.upsert({
        where: { slug: badge.slug },
        update: {
          name: badge.name,
          description: badge.description,
          category: badge.category,
          tier: badge.tier,
          threshold: badge.threshold,
        },
        create: badge,
      })
    }
  } catch (error) {
    captureError(error, { source: 'seedBadgeCatalog' })
  }
}

/**
 * Check and award any newly unlocked badges for a user.
 * Non-blocking — failures are logged but don't affect the caller.
 */
async function checkAndAwardBadges(prisma, userId) {
  try {
    const [user, existingBadges, allBadges] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          _count: {
            select: {
              studySheets: true,
              sheetCommits: true,
              followers: true,
            },
          },
        },
      }),
      prisma.userBadge.findMany({
        where: { userId },
        select: { badge: { select: { slug: true } } },
      }),
      prisma.badge.findMany(),
    ])

    if (!user) return

    const earned = new Set(existingBadges.map((ub) => ub.badge.slug))

    // Gather stats
    const sheetCount = user._count.studySheets
    const commitCount = user._count.sheetCommits
    const followerCount = user._count.followers

    const [totalStars, forkCount, contributionCount, reviewCount, streakData] = await Promise.all([
      prisma.studySheet
        .aggregate({ where: { userId }, _sum: { stars: true } })
        .then((r) => r._sum.stars || 0),
      prisma.studySheet.count({ where: { userId, NOT: [{ forkOf: null }] } }),
      prisma.sheetContribution.count({ where: { proposerId: userId } }),
      prisma.sheetContribution.count({ where: { reviewerId: userId } }),
      getUserStreak(prisma, userId),
    ])

    const statsMap = {
      'first-sheet': sheetCount,
      'prolific-writer': sheetCount,
      'study-machine': sheetCount,
      'first-star': totalStars,
      'first-fork': forkCount,
      'fork-master': forkCount,
      'first-commit': commitCount,
      'commit-streak': commitCount,
      'first-contribution': contributionCount,
      'helpful-reviewer': reviewCount,
      'community-star': totalStars,
      'first-follower': followerCount,
      'streak-3': streakData.currentStreak,
      'streak-7': streakData.currentStreak,
      'streak-30': streakData.currentStreak,
    }

    const toAward = []
    for (const badge of allBadges) {
      if (earned.has(badge.slug)) continue
      const stat = statsMap[badge.slug]
      if (stat !== undefined && stat >= badge.threshold) {
        toAward.push({ userId, badgeId: badge.id })
      }
    }

    if (toAward.length > 0) {
      await prisma.userBadge.createMany({ data: toAward, skipDuplicates: true })
    }
  } catch (error) {
    captureError(error, { source: 'checkAndAwardBadges', userId })
  }
}

module.exports = { BADGE_CATALOG, seedBadgeCatalog, checkAndAwardBadges }
