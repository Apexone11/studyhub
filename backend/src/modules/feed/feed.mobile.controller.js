/**
 * Mobile Feed Controller — lightweight, cursor-paginated feed for mobile clients.
 *
 * GET /api/feed/mobile
 *   Query: cursor (ISO-8601 createdAt), band (triage|discovery), limit (default 20, max 50)
 *   Authenticated, rate-limited via feedMobileLimiter.
 *
 * Two bands:
 *   triage   — max 5 items of recent activity relevant to the user
 *   discovery — broader course/following content with cursor pagination
 */
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { getBlockedUserIds, getMutedUserIds } = require('../../lib/social/blockFilter')
const { clampLimit } = require('../../lib/constants')
const { summarizeText } = require('./feed.service')

// ── Helpers ────────────────────────────────────────────────────────────────

function authorShape(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
  }
}

function sheetPayload(sheet) {
  return {
    title: sheet.title,
    courseTag: sheet.course?.code || null,
    starCount: sheet.stars || 0,
    forkCount: sheet.forks || 0,
  }
}

function notePayload(note) {
  const preview = summarizeText(note.content, 150)
  let tags = []
  try {
    tags = typeof note.tags === 'string' ? JSON.parse(note.tags) : note.tags || []
  } catch {
    tags = []
  }
  return {
    title: note.title,
    preview,
    pinned: note.pinned || false,
    tags,
    starCount: note._count?.noteStars || 0,
  }
}

function postPayload(post) {
  const body = summarizeText(post.content, 500)
  return {
    body,
    courseTag: post.course?.code || null,
    reactionCount: post._count?.reactions || 0,
    commentCount: post._count?.comments || 0,
  }
}

function announcementPayload(announcement) {
  return {
    body: announcement.body,
    courseName: null, // announcements are global, not course-specific
  }
}

function groupActivityPayload(session) {
  return {
    groupId: session.group?.id || session.groupId,
    groupName: session.group?.name || 'Study Group',
    summary: `Upcoming session: ${session.title}`,
  }
}

function toFeedItem(type, record, payload) {
  return {
    type,
    id: record.id,
    createdAt: record.createdAt,
    author: authorShape(record.author || record.user || null),
    payload,
  }
}

// ── Excluded-user list (block + mute) ──────────────────────────────────────

async function getExcludedUserIds(userId) {
  let blockedIds = []
  let mutedIds = []

  try {
    blockedIds = await getBlockedUserIds(prisma, userId)
  } catch {
    // graceful degradation
  }

  try {
    mutedIds = await getMutedUserIds(prisma, userId)
  } catch {
    // graceful degradation
  }

  return [...new Set([...blockedIds, ...mutedIds])]
}

// ── Triage band ────────────────────────────────────────────────────────────

async function fetchTriageBand(userId, excludedUserIds) {
  const items = []
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
  const notExcluded =
    excludedUserIds.length > 0 ? { NOT: [{ userId: { in: excludedUserIds } }] } : {}
  const authorNotExcluded =
    excludedUserIds.length > 0 ? { NOT: [{ id: { in: excludedUserIds } }] } : {}

  // Parallelize the four independent sections. Each section is wrapped
  // in its own try/catch so a single failed query degrades to an empty
  // contribution instead of taking down the whole band. Promise.all is
  // safe because every block returns an array (possibly empty) — there
  // is nothing for Promise.allSettled to guard against here.
  const [recentStars, newFollowers, upcomingSessions, freshSheets] = await Promise.all([
    // 1. Stars on user's sheets (recent)
    (async () => {
      try {
        return await prisma.starredSheet.findMany({
          where: {
            sheet: { userId },
            ...notExcluded,
          },
          take: 3,
          orderBy: { sheetId: 'desc' }, // StarredSheet has no createdAt, so approximate
          include: {
            sheet: {
              select: {
                id: true,
                title: true,
                stars: true,
                forks: true,
                createdAt: true,
                course: { select: { code: true } },
              },
            },
            user: { select: { id: true, username: true, avatarUrl: true } },
          },
        })
      } catch {
        return []
      }
    })(),

    // 2. New followers
    (async () => {
      try {
        return await prisma.userFollow.findMany({
          where: {
            followingId: userId,
            status: 'active',
            createdAt: { gte: oneDayAgo },
            follower: authorNotExcluded,
          },
          take: 2,
          orderBy: { createdAt: 'desc' },
          include: {
            follower: { select: { id: true, username: true, avatarUrl: true } },
          },
        })
      } catch {
        return []
      }
    })(),

    // 3. Upcoming study sessions (within next hour) — chained: need group
    // membership before the session query, so the inner pair stays
    // sequential while the outer block runs in parallel with 1/2/4.
    (async () => {
      try {
        const memberGroups = await prisma.studyGroupMember.findMany({
          where: { userId, status: 'active' },
          select: { groupId: true },
        })
        const groupIds = memberGroups.map((m) => m.groupId)
        if (groupIds.length === 0) return []
        return await prisma.groupSession.findMany({
          where: {
            groupId: { in: groupIds },
            scheduledAt: { gte: now, lte: oneHourFromNow },
            status: 'upcoming',
          },
          take: 2,
          orderBy: { scheduledAt: 'asc' },
          include: {
            group: { select: { id: true, name: true } },
          },
        })
      } catch {
        return []
      }
    })(),

    // 4. Fresh content from followed users — same chain pattern: list
    // followees first, then fetch their fresh sheets.
    (async () => {
      try {
        const followedUsers = await prisma.userFollow.findMany({
          where: { followerId: userId, status: 'active' },
          select: { followingId: true },
        })
        const followedIds = followedUsers
          .map((f) => f.followingId)
          .filter((id) => !excludedUserIds.includes(id))
        if (followedIds.length === 0) return []
        return await prisma.studySheet.findMany({
          where: {
            userId: { in: followedIds },
            status: 'published',
            createdAt: { gte: oneDayAgo },
          },
          take: 2,
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { code: true } },
          },
        })
      } catch {
        return []
      }
    })(),
  ])

  for (const star of recentStars) {
    items.push({
      type: 'sheet',
      id: star.sheet.id,
      createdAt: star.sheet.createdAt,
      author: authorShape(star.user),
      payload: sheetPayload(star.sheet),
    })
  }

  for (const follow of newFollowers) {
    items.push({
      type: 'post',
      id: follow.followerId,
      createdAt: follow.createdAt,
      author: authorShape(follow.follower),
      payload: {
        body: `${follow.follower.username} started following you`,
        courseTag: null,
        reactionCount: 0,
        commentCount: 0,
      },
    })
  }

  for (const session of upcomingSessions) {
    items.push({
      type: 'group_activity',
      id: session.id,
      createdAt: session.createdAt,
      author: null,
      payload: groupActivityPayload(session),
    })
  }

  for (const sheet of freshSheets) {
    items.push(toFeedItem('sheet', sheet, sheetPayload(sheet)))
  }

  // Sort by recency and cap at 5
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return items.slice(0, 5)
}

// ── Discovery band ─────────────────────────────────────────────────────────

async function fetchDiscoveryBand(userId, excludedUserIds, cursor, limit) {
  const items = []
  const cursorFilter = cursor ? { createdAt: { lt: new Date(cursor) } } : {}
  const notExcludedAuthor =
    excludedUserIds.length > 0 ? { NOT: [{ userId: { in: excludedUserIds } }] } : {}

  // Phase 1: fetch enrolled-course IDs and followed-user IDs in parallel.
  // These two queries are fully independent — Promise.all halves the
  // round-trip cost. Each is wrapped in its own catch so a single
  // failure degrades to an empty array.
  const [courseIds, followedIds] = await Promise.all([
    (async () => {
      try {
        const enrollments = await prisma.enrollment.findMany({
          where: { userId },
          select: { courseId: true },
        })
        return enrollments.map((e) => e.courseId)
      } catch {
        return []
      }
    })(),
    (async () => {
      try {
        const follows = await prisma.userFollow.findMany({
          where: { followerId: userId, status: 'active' },
          select: { followingId: true },
        })
        return follows.map((f) => f.followingId).filter((id) => !excludedUserIds.includes(id))
      } catch {
        return []
      }
    })(),
  ])

  // Build OR conditions: from enrolled courses OR from followed users
  const orConditions = []
  if (courseIds.length > 0) orConditions.push({ courseId: { in: courseIds } })
  if (followedIds.length > 0) orConditions.push({ userId: { in: followedIds } })

  // If user has no courses and follows nobody, show recent public content
  const hasFilters = orConditions.length > 0

  const postOrConditions = []
  if (courseIds.length > 0) postOrConditions.push({ courseId: { in: courseIds } })
  if (followedIds.length > 0) postOrConditions.push({ userId: { in: followedIds } })

  // Phase 2: fetch the four content types in parallel. Each is
  // independent of the others (they all share the prefetched
  // courseIds/followedIds but never read each other's results).
  const [sheets, notes, posts, announcements] = await Promise.all([
    (async () => {
      try {
        return await prisma.studySheet.findMany({
          where: {
            status: 'published',
            ...cursorFilter,
            ...notExcludedAuthor,
            ...(hasFilters ? { OR: orConditions } : {}),
          },
          take: Math.ceil(limit / 2),
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { code: true } },
          },
        })
      } catch {
        return []
      }
    })(),
    (async () => {
      try {
        return await prisma.note.findMany({
          where: {
            private: false,
            ...cursorFilter,
            ...notExcludedAuthor,
            ...(hasFilters ? { OR: orConditions } : {}),
          },
          take: Math.ceil(limit / 4),
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { code: true } },
            _count: { select: { noteStars: true } },
          },
        })
      } catch {
        return []
      }
    })(),
    (async () => {
      try {
        return await prisma.feedPost.findMany({
          where: {
            moderationStatus: 'clean',
            ...cursorFilter,
            ...notExcludedAuthor,
            ...(postOrConditions.length > 0 ? { OR: postOrConditions } : {}),
          },
          take: Math.ceil(limit / 4),
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { code: true } },
            _count: { select: { reactions: true, comments: true } },
          },
        })
      } catch {
        return []
      }
    })(),
    (async () => {
      try {
        return await prisma.announcement.findMany({
          where: {
            ...cursorFilter,
          },
          take: Math.min(3, Math.ceil(limit / 6)),
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
          },
        })
      } catch {
        return []
      }
    })(),
  ])

  for (const sheet of sheets) {
    items.push(toFeedItem('sheet', sheet, sheetPayload(sheet)))
  }
  for (const note of notes) {
    items.push(toFeedItem('note', note, notePayload(note)))
  }
  for (const post of posts) {
    items.push(toFeedItem('post', post, postPayload(post)))
  }
  for (const ann of announcements) {
    items.push(toFeedItem('announcement', ann, announcementPayload(ann)))
  }

  // Sort all items by createdAt desc
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  // Trim to requested limit
  const trimmed = items.slice(0, limit)
  const nextCursor = trimmed.length === limit ? trimmed[trimmed.length - 1].createdAt : null
  const hasMore = trimmed.length === limit

  return { items: trimmed, nextCursor, hasMore }
}

// ── Route handler ──────────────────────────────────────────────────────────

async function getMobileFeed(req, res) {
  try {
    const userId = req.user.userId
    const band = req.query.band === 'triage' ? 'triage' : 'discovery'
    const rawCursor = typeof req.query.cursor === 'string' ? req.query.cursor : null
    const limit = clampLimit(req.query.limit, { defaultSize: 20, maxSize: 50 })

    // Validate cursor parses to a real date before using it in Prisma filters
    let cursor = null
    if (rawCursor) {
      const parsed = new Date(rawCursor)
      if (Number.isNaN(parsed.getTime())) {
        return sendError(res, 400, 'Invalid cursor value.', ERROR_CODES.BAD_REQUEST)
      }
      cursor = rawCursor
    }

    const excludedUserIds = await getExcludedUserIds(userId)

    if (band === 'triage') {
      const items = await fetchTriageBand(userId, excludedUserIds)
      return res.json({ items, nextCursor: null, hasMore: false })
    }

    const result = await fetchDiscoveryBand(userId, excludedUserIds, cursor, limit)
    return res.json(result)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load mobile feed.', ERROR_CODES.INTERNAL)
  }
}

module.exports = { getMobileFeed }
