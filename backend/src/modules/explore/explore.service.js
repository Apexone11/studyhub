/**
 * explore.service.js — G2-3 cross-school discovery queries.
 *
 * Read-only, cross-school (no school scoping), block-filtered. Powers the
 * /explore tab where self-learners (and anyone) discover sheets/notes/groups
 * across every school. Topic chips reuse the G2-4 TopicCanonical catalog.
 *
 * See docs/internal/plans/g2-3-self-learner-explore.md.
 */
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const courseAliasing = require('../../lib/courseAliasing')

const TRENDING_WINDOW_DAYS = 30
const AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarUrl: true }

// Block-filter is best-effort: a missing/locked UserBlock table must NOT break
// discovery (CLAUDE.md rule 10). Returns [] on any error.
async function safeBlockedIds(viewerId) {
  if (!viewerId) return []
  try {
    return await getBlockedUserIds(prisma, viewerId)
  } catch (err) {
    log.warn(
      { event: 'explore.block_filter_failed', err: err?.message },
      'Explore block-filter degraded to empty',
    )
    return []
  }
}

// Resolve an optional topicTag to the courseIds it spans (validated against the
// alias allowlist). null topic => no course constraint.
async function topicCourseIds(topic) {
  if (!topic || !courseAliasing.isValidTag(topic)) return null
  const aliases = await prisma.courseAlias.findMany({
    where: { topicTag: topic },
    select: { courseId: true },
    take: 500,
  })
  return aliases.map((a) => a.courseId)
}

function notInAuthor(blockedIds) {
  return blockedIds.length ? { userId: { notIn: blockedIds } } : {}
}

async function listSheets({ topic, limit, viewerId } = {}) {
  const blocked = await safeBlockedIds(viewerId)
  const courseIds = await topicCourseIds(topic)
  if (courseIds && courseIds.length === 0) return [] // topic with no courses
  const where = {
    status: 'published',
    ...notInAuthor(blocked),
    ...(courseIds ? { courseId: { in: courseIds } } : {}),
  }
  return prisma.studySheet.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      previewText: true,
      stars: true,
      createdAt: true,
      author: { select: AUTHOR_SELECT },
      course: { select: { id: true, code: true, name: true, school: { select: { name: true } } } },
    },
  })
}

async function trendingSheets({ limit, viewerId } = {}) {
  const blocked = await safeBlockedIds(viewerId)
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  // "Trending this week" = recent + most-starred. Momentum proxy: published in
  // the last 30 days, ordered by stars then recency. (A true stars-gained-in-
  // window score is a v2 once we track star timestamps.)
  return prisma.studySheet.findMany({
    where: { status: 'published', createdAt: { gte: since }, ...notInAuthor(blocked) },
    orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      previewText: true,
      stars: true,
      createdAt: true,
      author: { select: AUTHOR_SELECT },
      course: { select: { id: true, code: true, name: true, school: { select: { name: true } } } },
    },
  })
}

async function listNotes({ topic, limit, viewerId } = {}) {
  const blocked = await safeBlockedIds(viewerId)
  const courseIds = await topicCourseIds(topic)
  if (courseIds && courseIds.length === 0) return []
  return prisma.note.findMany({
    where: {
      private: false,
      moderationStatus: 'clean',
      ...notInAuthor(blocked),
      ...(courseIds ? { courseId: { in: courseIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      createdAt: true,
      author: { select: AUTHOR_SELECT },
      course: { select: { id: true, code: true, name: true } },
    },
  })
}

async function listStudyGroups({ topic, limit } = {}) {
  const courseIds = await topicCourseIds(topic)
  if (courseIds && courseIds.length === 0) return []
  // Public groups carry no author dimension to block-filter on here — the
  // privacy + moderationStatus gate is the relevant filter for discovery.
  return prisma.studyGroup.findMany({
    where: {
      privacy: 'public',
      moderationStatus: 'active',
      ...(courseIds ? { courseId: { in: courseIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      course: { select: { id: true, code: true, name: true } },
      _count: { select: { members: true } },
    },
  })
}

async function listTopics(context) {
  return courseAliasing.listTopics(context)
}

module.exports = {
  listSheets,
  trendingSheets,
  listNotes,
  listStudyGroups,
  listTopics,
  TRENDING_WINDOW_DAYS,
}
