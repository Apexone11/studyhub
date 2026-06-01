/**
 * courseAliasing.js — G2-4 cross-school course-equivalence helpers.
 *
 * A `topicTag` (e.g. 'cs-intro') maps many school-specific Course rows to one
 * canonical topic so search and the course-detail "Equivalent at other schools"
 * view can surface CMSC131 + CS61A + 6.0001 together. Curated, not crowdsourced
 * (Transferology / ASSIST model). Everything here is gated behind
 * `flag_course_aliasing` (fail-closed — see CLAUDE.md §12).
 *
 * See docs/internal/plans/g2-4-course-aliasing.md.
 */
const prisma = require('./prisma')
const log = require('./logger')
const { evaluateFlag } = require('./featureFlags')

const FLAG = 'flag_course_aliasing'
// topicTag allowlist: lowercase alnum + hyphen, 1-80 chars. Validates any tag
// that reaches a Prisma `where`/`in` clause (A13) and slugifies free text.
const TOPIC_TAG_RE = /^[a-z0-9-]{1,80}$/
const FUZZY_THRESHOLD = 0.3
const MAX_TOPICS_PER_QUERY = 5
const MAX_EXPANDED_COURSE_IDS = 200

async function isEnabled(context = {}) {
  try {
    const result = await evaluateFlag(FLAG, context)
    return result.enabled === true
  } catch {
    return false // fail-closed
  }
}

/** Slugify free text to a candidate topicTag ('Intro Programming' -> 'intro-programming'). */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function isValidTag(tag) {
  return typeof tag === 'string' && TOPIC_TAG_RE.test(tag)
}

/**
 * Resolve a free-text query to known topicTags: exact tag/slug match first,
 * then a pg_trgm fuzzy match on displayName. Falls back to a plain ILIKE
 * contains if pg_trgm is unavailable (so a missing extension degrades to
 * literal matching rather than throwing). Returns up to MAX_TOPICS_PER_QUERY.
 */
async function resolveTopicTags(query) {
  const raw = String(query || '').trim()
  if (!raw) return []

  const slug = slugify(raw)
  const tags = new Set()

  // 1) exact tag / slug match
  if (isValidTag(slug)) {
    const exact = await prisma.topicCanonical.findUnique({ where: { topicTag: slug } })
    if (exact) tags.add(exact.topicTag)
  }

  // 2) fuzzy displayName match (pg_trgm), graceful fallback to ILIKE contains
  try {
    const rows = await prisma.$queryRaw`
      SELECT "topicTag"
      FROM "TopicCanonical"
      WHERE similarity("displayName", ${raw}) > ${FUZZY_THRESHOLD}
      ORDER BY similarity("displayName", ${raw}) DESC
      LIMIT ${MAX_TOPICS_PER_QUERY}
    `
    for (const row of rows) tags.add(row.topicTag)
  } catch (err) {
    // pg_trgm not installed (e.g. a dev DB without the migration) — degrade.
    log.warn(
      { event: 'course_aliasing.trgm_unavailable', err: err?.message },
      'pg_trgm unavailable; falling back to ILIKE contains for topic resolution',
    )
    const fallback = await prisma.topicCanonical.findMany({
      where: { displayName: { contains: raw, mode: 'insensitive' } },
      select: { topicTag: true },
      take: MAX_TOPICS_PER_QUERY,
    })
    for (const row of fallback) tags.add(row.topicTag)
  }

  return Array.from(tags).filter(isValidTag).slice(0, MAX_TOPICS_PER_QUERY)
}

/**
 * Expand a free-text search query to the set of courseIds that share a topic
 * with it. Returns [] when the flag is off, the query matches no topic, or on
 * any error (search must never break because aliasing hiccuped).
 */
async function expandQueryToCourseIds(query, context = {}) {
  try {
    if (!(await isEnabled(context))) return []
    const tags = await resolveTopicTags(query)
    if (tags.length === 0) return []
    const aliases = await prisma.courseAlias.findMany({
      where: { topicTag: { in: tags } },
      select: { courseId: true },
      take: MAX_EXPANDED_COURSE_IDS,
    })
    return Array.from(new Set(aliases.map((a) => a.courseId)))
  } catch (err) {
    log.warn(
      { event: 'course_aliasing.expand_failed', err: err?.message },
      'Course-alias query expansion failed; returning no expansion',
    )
    return []
  }
}

/**
 * "Equivalent at other schools" for a course: every OTHER course sharing any of
 * this course's topicTags, each annotated with the topicTag + displayName that
 * links them (so the UI can explain why). Deduped by courseId. Returns [] when
 * the flag is off or the course has no aliases.
 */
async function getEquivalentCourses(courseId, context = {}) {
  if (!Number.isInteger(courseId) || courseId < 1) return []
  if (!(await isEnabled(context))) return []
  try {
    const myAliases = await prisma.courseAlias.findMany({
      where: { courseId },
      select: { topicTag: true },
    })
    const tags = Array.from(new Set(myAliases.map((a) => a.topicTag))).filter(isValidTag)
    if (tags.length === 0) return []

    const siblings = await prisma.courseAlias.findMany({
      where: { topicTag: { in: tags }, NOT: [{ courseId }] },
      select: {
        topicTag: true,
        course: {
          select: {
            id: true,
            code: true,
            name: true,
            school: { select: { id: true, name: true } },
          },
        },
      },
      take: MAX_EXPANDED_COURSE_IDS,
    })

    const labels = await prisma.topicCanonical.findMany({
      where: { topicTag: { in: tags } },
      select: { topicTag: true, displayName: true },
    })
    const labelByTag = new Map(labels.map((l) => [l.topicTag, l.displayName]))

    const byCourse = new Map()
    for (const row of siblings) {
      if (!row.course) continue
      const existing = byCourse.get(row.course.id)
      const topic = { topicTag: row.topicTag, displayName: labelByTag.get(row.topicTag) || null }
      if (existing) {
        if (!existing.topics.some((t) => t.topicTag === topic.topicTag)) existing.topics.push(topic)
      } else {
        byCourse.set(row.course.id, {
          id: row.course.id,
          code: row.course.code,
          name: row.course.name,
          school: row.course.school,
          topics: [topic],
        })
      }
    }
    return Array.from(byCourse.values())
  } catch (err) {
    log.warn(
      { event: 'course_aliasing.equivalents_failed', courseId, err: err?.message },
      'Failed to load course equivalents',
    )
    return []
  }
}

/**
 * Topic catalog for chips (shared with the Explore tab, G2-3): every
 * TopicCanonical with its course count. Returns [] when the flag is off.
 */
async function listTopics(context = {}) {
  if (!(await isEnabled(context))) return []
  try {
    const [topics, counts] = await Promise.all([
      prisma.topicCanonical.findMany({
        orderBy: { displayName: 'asc' },
        select: { topicTag: true, displayName: true, category: true, cipCode: true },
      }),
      prisma.courseAlias.groupBy({ by: ['topicTag'], _count: { courseId: true } }),
    ])
    const countByTag = new Map(counts.map((c) => [c.topicTag, c._count.courseId]))
    return topics.map((t) => ({ ...t, courseCount: countByTag.get(t.topicTag) || 0 }))
  } catch (err) {
    log.warn(
      { event: 'course_aliasing.topics_failed', err: err?.message },
      'Failed to load topic catalog',
    )
    return []
  }
}

module.exports = {
  FLAG,
  TOPIC_TAG_RE,
  isEnabled,
  slugify,
  isValidTag,
  resolveTopicTags,
  expandQueryToCourseIds,
  getEquivalentCourses,
  listTopics,
}
