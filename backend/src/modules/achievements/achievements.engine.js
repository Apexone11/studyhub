/**
 * achievements.engine.js — event-driven award engine.
 *
 * Replaces the polling `checkAndAwardBadges` of v1 with `emitAchievementEvent`.
 * Each trigger site (sheet publish, contribution accept, group join, etc.)
 * fires a typed event; the engine routes the event to the criteria evaluators
 * that depend on it.
 *
 * Design constraint: this is fire-and-forget. Trigger sites never await the
 * engine — failures are logged via Sentry but never bubble back to callers.
 *
 * Plan: docs/internal/audits/2026-04-30-achievements-v2-plan.md §7.3.
 */

const { captureError } = require('../../monitoring/sentry')
const { BADGE_CATALOG, TIER_RANK, levelForXp } = require('./achievements.constants')
const { getUserStreak } = require('../../lib/streaks')

/**
 * Recognised event kinds. Trigger sites must use one of these strings.
 * Adding a new kind: append here, then add a corresponding evaluator below.
 */
const EVENT_KINDS = Object.freeze({
  SHEET_PUBLISH: 'sheet.publish',
  SHEET_FORK: 'sheet.fork',
  SHEET_AUDIT_GRADE_HIGH: 'sheet.audit_grade_high',
  CONTRIBUTION_SUBMIT: 'contribution.submit',
  CONTRIBUTION_ACCEPT: 'contribution.accept',
  CONTRIBUTION_QUICKDRAW: 'contribution.quickdraw',
  CONTRIBUTION_PERFECT: 'contribution.perfect',
  REVIEW_SUBMIT: 'review.submit',
  REVIEW_FAST: 'review.fast',
  COMMIT_CREATE: 'commit.create',
  NOTE_CREATE: 'note.create',
  FOLLOW_RECEIVED: 'follow.received',
  STAR_RECEIVED: 'star.received',
  GROUP_JOIN: 'group.join',
  GROUP_CREATE: 'group.create',
  GROUP_SESSION_HOST: 'group_session.host',
  AI_MESSAGE: 'ai.message',
  AI_PUBLISH_SHEET: 'ai.publish_sheet',
  STREAK_UPDATE: 'streak.update',
  DONATION_COMPLETE: 'donation.complete',
  SUBSCRIPTION_ACTIVATE: 'subscription.activate',
  PLAGIARISM_CONFIRMED_REPORT: 'plagiarism.confirmed_report',
  LOGIN: 'login',
})

// Criteria types that may depend on AchievementEvent metadata. Engine writes a
// row to AchievementEvent for these only — the rest of the kinds skip the log
// because their criteria can be evaluated from the user's regular tables.
const KIND_REQUIRES_EVENT_LOG = Object.freeze(
  new Set([
    'sheet.publish', // for early-bird / night-owl (timed) and polyglot (lang)
    'sheet.audit_grade_high', // for quality-A
    'review.fast', // for fast-reviewer
    'contribution.quickdraw', // for quickdraw
    'contribution.perfect', // for perfect-pr
    'ai.publish_sheet', // for ai-author
    'plagiarism.confirmed_report', // for plagiarism-spotter
  ]),
)

/**
 * Public entry point. Fire-and-forget; never throws.
 *
 * @param {object} prisma
 * @param {number} userId
 * @param {string} kind  one of EVENT_KINDS
 * @param {Record<string, unknown>} [metadata]
 * @returns {Promise<{awarded: string[]}>}
 */
async function emitAchievementEvent(prisma, userId, kind, metadata = {}) {
  if (!userId || !kind) return { awarded: [] }
  try {
    if (KIND_REQUIRES_EVENT_LOG.has(kind)) {
      try {
        await prisma.achievementEvent.create({
          data: { userId, kind, metadata: metadata || {} },
        })
      } catch (err) {
        // Event log write failed — degrade gracefully. Most criteria still work
        // from the user's stable tables; only the timed/event-match criteria
        // depend on this row.
        captureError(err, { source: 'emitAchievementEvent.log', userId, kind })
      }
    }

    const awarded = await evaluateAndAward(prisma, userId, kind, metadata)
    return { awarded }
  } catch (error) {
    captureError(error, { source: 'emitAchievementEvent', userId, kind })
    return { awarded: [] }
  }
}

/**
 * Pull all candidate badges for this event kind and check each one.
 * Awards any that pass criteria and the user does not yet hold.
 *
 * @returns {Promise<string[]>} slugs awarded in this call
 */
async function evaluateAndAward(prisma, userId, kind, metadata) {
  const [allBadges, heldBadges] = await Promise.all([
    prisma.badge.findMany(),
    prisma.userBadge.findMany({
      where: { userId },
      select: { badge: { select: { slug: true } } },
    }),
  ])
  const heldSlugs = new Set(heldBadges.map((ub) => ub.badge.slug))

  // Some pre-computed user stats. Compute lazily — only fetch what we need.
  const statsCache = {}
  async function getStats(name) {
    if (statsCache[name] !== undefined) return statsCache[name]
    statsCache[name] = await computeStat(prisma, userId, name)
    return statsCache[name]
  }

  const awarded = []
  for (const badge of allBadges) {
    if (heldSlugs.has(badge.slug)) continue
    if (!shouldEvaluateForKind(badge, kind)) continue
    const passes = await evaluateCriteria(prisma, userId, badge, metadata, getStats)
    if (passes) {
      const ok = await awardBadge(prisma, userId, badge)
      if (ok) awarded.push(badge.slug)
    }
  }
  return awarded
}

/**
 * Filter badges so we only evaluate the ones whose criteria could plausibly
 * change as a result of this event kind. Reduces work on every trigger.
 */
function shouldEvaluateForKind(badge, kind) {
  if (!badge.criteria) return false
  const c = badge.criteria
  switch (c.type) {
    case 'count':
      return KIND_AFFECTS_SOURCE[kind]?.includes(c.source) || false
    case 'sum':
      return KIND_AFFECTS_SOURCE[kind]?.includes(c.source) || false
    case 'distinct_count':
      return KIND_AFFECTS_SOURCE[kind]?.includes(c.source) || false
    case 'streak':
      return kind === 'streak.update'
    case 'event_match':
      return kind === c.kind
    case 'timed':
      return kind === c.kind
    case 'plan_active':
      return kind === 'subscription.activate'
    case 'created_before':
      // Evaluate on every login event so existing-but-not-yet-awarded users
      // pick up the founding-member badge the next time they log in.
      return kind === 'login'
    case 'admin_grant':
      return false // never auto-awarded
    case 'max_forks_per_sheet':
      return kind === 'sheet.fork' || kind === 'sheet.publish'
    case 'max_members_in_owned_group':
      return kind === 'group.join' || kind === 'group.create'
    default:
      return false
  }
}

// Maps event kind → which `count`/`sum`/`distinct_count` sources might change.
const KIND_AFFECTS_SOURCE = Object.freeze({
  'sheet.publish': ['sheets_published', 'sheet_courses', 'sheet_languages'],
  'sheet.fork': ['forks_made'],
  'star.received': ['stars_received'],
  'contribution.submit': ['contributions_submitted'],
  'contribution.accept': ['contributions_accepted'],
  'review.submit': ['reviews_done'],
  'commit.create': ['commits'],
  'note.create': ['notes_created', 'note_tags'],
  'follow.received': ['followers'],
  'group.join': ['group_memberships'],
  'group.create': ['groups_created'],
  'group_session.host': ['sessions_hosted'],
  'ai.message': ['ai_messages'],
  'donation.complete': ['donations_cents'],
})

/**
 * Evaluate a single badge's criteria. Returns true if the user qualifies.
 */
async function evaluateCriteria(prisma, userId, badge, metadata, getStats) {
  const c = badge.criteria
  if (!c || !c.type) return false

  try {
    switch (c.type) {
      case 'count': {
        const n = await getStats(c.source)
        return n >= (c.threshold || 1)
      }
      case 'sum': {
        const n = await getStats(c.source)
        return n >= (c.threshold || 1)
      }
      case 'distinct_count': {
        const n = await getStats(c.source)
        return n >= (c.threshold || 1)
      }
      case 'streak': {
        const data = await getUserStreak(prisma, userId)
        // Weekend-only streaks aren't tracked yet — treat as not earned for now.
        // (Live streak service would need extension; deferred to V2.5.)
        if (c.weekendOnly) return false
        return (data.currentStreak || 0) >= c.threshold
      }
      case 'event_match': {
        // Did at least N events of this kind happen for this user?
        const n = await prisma.achievementEvent.count({
          where: { userId, kind: c.kind },
        })
        return n >= (c.threshold || 1)
      }
      case 'timed': {
        // At least one event of c.kind whose hour falls in c.hourRange.
        // hourRange may wrap midnight (e.g. [23, 3]).
        const events = await prisma.achievementEvent.findMany({
          where: { userId, kind: c.kind },
          select: { metadata: true },
          take: 50,
        })
        const [from, to] = c.hourRange || [0, 0]
        return events.some((ev) => {
          const hour = ev.metadata && typeof ev.metadata.hour === 'number' ? ev.metadata.hour : null
          if (hour === null) return false
          if (from <= to) return hour >= from && hour <= to
          return hour >= from || hour <= to // wraps midnight
        })
      }
      case 'plan_active': {
        const sub = await prisma.subscription.findFirst({
          where: {
            userId,
            status: { in: ['active', 'trialing', 'past_due'] },
            plan: { in: c.plans || [] },
          },
          select: { id: true },
        })
        return Boolean(sub)
      }
      case 'created_before': {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { createdAt: true },
        })
        if (!user) return false
        const cutoff = new Date(c.date)
        return user.createdAt.getTime() <= cutoff.getTime()
      }
      case 'max_forks_per_sheet': {
        const result = await prisma.studySheet.aggregate({
          where: { userId },
          _max: { forks: true },
        })
        const max = result._max.forks || 0
        return max >= (c.threshold || 1)
      }
      case 'max_members_in_owned_group': {
        const groups = await prisma.studyGroup.findMany({
          where: { creatorId: userId, deletedAt: null },
          select: { _count: { select: { members: true } } },
        })
        const max = groups.reduce((m, g) => Math.max(m, g._count.members), 0)
        return max >= (c.threshold || 1)
      }
      case 'admin_grant':
        return false
      default:
        return false
    }
  } catch (error) {
    captureError(error, { source: 'evaluateCriteria', userId, slug: badge.slug })
    return false
  }
}

/**
 * Compute one named stat for the user. Used by count/sum/distinct evaluators.
 */
async function computeStat(prisma, userId, source) {
  switch (source) {
    case 'sheets_published':
      // Only "published" sheets count (status === 'published') so drafts don't inflate.
      return prisma.studySheet.count({ where: { userId, status: 'published' } })
    case 'forks_made':
      return prisma.studySheet.count({ where: { userId, NOT: [{ forkOf: null }] } })
    case 'stars_received':
      return prisma.studySheet
        .aggregate({ where: { userId }, _sum: { stars: true } })
        .then((r) => r._sum.stars || 0)
    case 'contributions_submitted':
      return prisma.sheetContribution.count({ where: { proposerId: userId } })
    case 'contributions_accepted':
      return prisma.sheetContribution.count({
        where: { proposerId: userId, status: 'accepted' },
      })
    case 'reviews_done':
      return prisma.sheetContribution.count({ where: { reviewerId: userId } })
    case 'commits':
      return prisma.sheetCommit.count({ where: { userId } })
    case 'notes_created':
      return prisma.note.count({ where: { userId } })
    case 'followers':
      return prisma.userFollow.count({ where: { followingId: userId } })
    case 'ai_messages':
      // AiMessage table tracks every message; engine counts ones authored by user.
      // If the table is missing (older deployment), degrade to 0.
      try {
        return await prisma.aiMessage.count({ where: { authorId: userId, role: 'user' } })
      } catch {
        return 0
      }
    case 'group_memberships':
      return prisma.studyGroupMember.count({ where: { userId, status: 'active' } })
    case 'groups_created':
      return prisma.studyGroup.count({ where: { creatorId: userId, deletedAt: null } })
    case 'sessions_hosted':
      // Sessions where the user is the creator/host of the group session row.
      try {
        return await prisma.groupSession.count({ where: { hostId: userId } })
      } catch {
        return 0
      }
    case 'donations_cents':
      try {
        const rows = await prisma.donation.aggregate({
          where: { userId, status: 'completed' },
          _sum: { amount: true },
        })
        return rows._sum.amount || 0
      } catch {
        return 0
      }
    case 'sheet_courses': {
      const rows = await prisma.studySheet.findMany({
        where: { userId, status: 'published' },
        select: { courseId: true },
      })
      return new Set(rows.map((r) => r.courseId).filter(Boolean)).size
    }
    case 'sheet_languages': {
      const rows = await prisma.achievementEvent.findMany({
        where: { userId, kind: 'sheet.publish' },
        select: { metadata: true },
      })
      const langs = new Set()
      for (const r of rows) {
        const lang = r.metadata && typeof r.metadata.lang === 'string' ? r.metadata.lang : null
        if (lang) langs.add(lang)
      }
      return langs.size
    }
    case 'note_tags': {
      const rows = await prisma.note.findMany({
        where: { userId },
        select: { tags: true },
      })
      const tags = new Set()
      for (const r of rows) {
        if (Array.isArray(r.tags)) {
          for (const t of r.tags) {
            if (typeof t === 'string' && t.trim().length > 0) tags.add(t.trim().toLowerCase())
          }
        }
      }
      return tags.size
    }
    default:
      return 0
  }
}

/**
 * Insert UserBadge + recompute UserAchievementStats. Idempotent: returns false
 * if the user already holds the badge (race-safe).
 *
 * @returns {Promise<boolean>} true if a new row was inserted
 */
async function awardBadge(prisma, userId, badge) {
  try {
    const result = await prisma.userBadge.create({
      data: { userId, badgeId: badge.id },
    })
    if (!result) return false
    await recomputeUserAchievementStats(prisma, userId)
    // Best-effort notification (uses existing notify pipeline). If the
    // notifications module isn't available or fails, the badge still awards.
    try {
      const { createNotification } = require('../../lib/notify')
      await createNotification(prisma, {
        userId,
        type: 'achievement_unlock',
        message: `Achievement unlocked: ${badge.name}.`,
        actorId: userId,
        linkPath: `/achievements/${badge.slug}`,
        priority: 'low',
        dedupKey: `achievement:${badge.slug}`,
        metadata: {
          slug: badge.slug,
          name: badge.name,
          tier: badge.tier,
          xp: badge.xp,
        },
      })
    } catch {
      // Notification creation is best-effort; badge award itself already succeeded.
    }
    return true
  } catch (error) {
    // P2002 = unique constraint failure: user already has this badge.
    if (error && error.code === 'P2002') return false
    captureError(error, { source: 'awardBadge', userId, slug: badge.slug })
    return false
  }
}

/**
 * Recompute the denormalized stats row from the user's UserBadge rows.
 * Called inside awardBadge and again by the backfill script.
 */
async function recomputeUserAchievementStats(prisma, userId) {
  try {
    const held = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { xp: true, tier: true } } },
    })
    const totalXp = held.reduce((s, ub) => s + (ub.badge?.xp || 0), 0)
    const level = levelForXp(totalXp)
    const unlockedCount = held.length
    let highestTierRank = 0
    let highestTierName = 'bronze'
    for (const ub of held) {
      const rank = TIER_RANK[ub.badge?.tier] || 0
      if (rank > highestTierRank) {
        highestTierRank = rank
        highestTierName = ub.badge.tier
      }
    }
    await prisma.userAchievementStats.upsert({
      where: { userId },
      create: { userId, totalXp, level, unlockedCount, highestTier: highestTierName },
      update: { totalXp, level, unlockedCount, highestTier: highestTierName },
    })
  } catch (error) {
    captureError(error, { source: 'recomputeUserAchievementStats', userId })
  }
}

/**
 * Backward-compatible legacy entry point.
 *
 * The original v1 `checkAndAwardBadges` was called from 5 trigger sites.
 * We keep it working by translating each call to a generic re-evaluation that
 * checks every kind. Slower than the event-driven path but safe.
 *
 * Prefer `emitAchievementEvent(prisma, userId, kind, metadata)` for new code.
 */
async function checkAndAwardBadgesLegacy(prisma, userId) {
  if (!userId) return
  try {
    // Fire one synthetic event for every kind so all evaluators run.
    // We do not write AchievementEvent rows here — only criteria that work
    // off stable tables will pass.
    const allBadges = await prisma.badge.findMany()
    const held = new Set(
      (
        await prisma.userBadge.findMany({
          where: { userId },
          select: { badge: { select: { slug: true } } },
        })
      ).map((ub) => ub.badge.slug),
    )
    const statsCache = {}
    async function getStats(name) {
      if (statsCache[name] !== undefined) return statsCache[name]
      statsCache[name] = await computeStat(prisma, userId, name)
      return statsCache[name]
    }
    for (const badge of allBadges) {
      if (held.has(badge.slug)) continue
      const passes = await evaluateCriteria(prisma, userId, badge, {}, getStats)
      if (passes) await awardBadge(prisma, userId, badge)
    }
  } catch (error) {
    captureError(error, { source: 'checkAndAwardBadgesLegacy', userId })
  }
}

/**
 * Seed the Badge table with all entries from BADGE_CATALOG.
 * Idempotent (upsert on slug). Called at server boot from bootstrap.js.
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
          xp: badge.xp,
          isSecret: badge.isSecret,
          displayOrder: badge.displayOrder,
          iconSlug: badge.iconSlug,
          criteria: badge.criteria,
        },
        create: {
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          category: badge.category,
          tier: badge.tier,
          threshold: badge.threshold,
          xp: badge.xp,
          isSecret: badge.isSecret,
          displayOrder: badge.displayOrder,
          iconSlug: badge.iconSlug,
          criteria: badge.criteria,
        },
      })
    }
  } catch (error) {
    captureError(error, { source: 'seedBadgeCatalog' })
  }
}

module.exports = {
  EVENT_KINDS,
  emitAchievementEvent,
  recomputeUserAchievementStats,
  checkAndAwardBadgesLegacy,
  seedBadgeCatalog,
}
