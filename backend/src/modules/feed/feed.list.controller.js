const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { getBlockedUserIds, getMutedUserIds } = require('../../lib/social/blockFilter')
const { parsePositiveInt } = require('../../core/http/validate')
const {
  settleSection,
  formatAnnouncement,
  formatSheet,
  formatPost,
  formatNote,
} = require('./feed.service')
const { enrichUsersWithBadges } = require('../../lib/userBadges')
const log = require('../../lib/logger')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()

// Allowlist for the `sort` query param. Anything else falls back to
// 'ranked'. CLAUDE.md A13 — explicit allowlist before any string from
// req.query reaches branching logic.
const ALLOWED_SORT_MODES = new Set(['ranked', 'recent'])

/**
 * Score a feed item with a Hacker-News-style time-decay model blended with
 * engagement and personalization signals. Returned score is consumed by the
 * `merged.sort()` call below to order the candidate window before pagination.
 *
 * Formula:
 *   engagement = likes + comments * 2 + forks * 3 + downloads * 0.1
 *                + dislikes * -0.5
 *   timeScore  = (engagement + 1) / (ageHours + 2) ** 1.5
 *   final      = timeScore * followBoost * schoolBoost * courseBoost
 *
 * The `+1` keeps a brand-new post with zero engagement above a 7-day-old post
 * with one like. The `+2` epsilon in the denominator prevents divide-by-zero
 * for posts created in the last second and keeps the slope reasonable for
 * very fresh posts. Pinned announcements bypass scoring (handled at sort
 * time) so admin urgent-comms always sit at the top.
 */
function scoreFeedItem(item, userContext = null) {
  const likes = item.reactions?.likes || item.stars || 0
  const dislikes = item.reactions?.dislikes || 0
  const comments = item.commentCount || 0
  const forks = item.forks || item.forkCount || 0
  const downloads = item.downloads || 0
  // Use createdAt; missing dates fall back to "old" so they sink rather than
  // promoting bad data. Math.max guards against future-dated rows.
  const created = item.createdAt ? new Date(item.createdAt).getTime() : 0
  const ageHours = Math.max(0, (Date.now() - created) / (1000 * 60 * 60))
  const engagement = likes * 1 + comments * 2 + forks * 3 + downloads * 0.1 + dislikes * -0.5
  // Hacker-News-style decay: posts older than ~7d sink hard, fresh posts
  // float even with zero engagement (the +1 gives them a baseline lift).
  let score = (engagement + 1) / Math.pow(ageHours + 2, 1.5)

  if (userContext) {
    const courseId = item.course?.id || item.courseId
    const authorId = item.author?.id || item.user?.id || item.authorId
    const authorSchoolIds = item.authorSchoolIds || null

    // Followed authors — strongest personalization signal.
    if (userContext.followingIds && authorId && userContext.followingIds.has(authorId)) {
      score *= 1.5
    }
    // Same-school authors — softer boost, only if not already a follow.
    else if (
      userContext.schoolIds &&
      userContext.schoolIds.size > 0 &&
      Array.isArray(authorSchoolIds) &&
      authorSchoolIds.some((id) => userContext.schoolIds.has(id))
    ) {
      score *= 1.2
    }
    // Course enrollment overlap — independent of follow/school.
    if (userContext.courseIds && courseId && userContext.courseIds.has(courseId)) {
      score *= 1.3
    }
  }

  return score
}

router.get('/', async (req, res) => {
  const startedAt = Date.now()
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)
  // For `sort=ranked` we pull a wider candidate window so the JS scorer
  // has enough material to outrank a pure recency feed. The window must
  // also scale with offset, otherwise infinite-scroll past the first ~10
  // pages slices into an empty tail and breaks pagination silently.
  // Capped at RANKED_MAX_CANDIDATES so a deep-page request can't issue
  // unbounded per-section queries.
  const rawSort = typeof req.query.sort === 'string' ? req.query.sort : 'ranked'
  const sortMode = ALLOWED_SORT_MODES.has(rawSort) ? rawSort : 'ranked'
  const RANKED_BASE_CANDIDATES = 200
  const RANKED_MAX_CANDIDATES = 500
  const candidateWindow =
    sortMode === 'ranked'
      ? Math.min(RANKED_MAX_CANDIDATES, Math.max(RANKED_BASE_CANDIDATES, offset + limit + 32))
      : limit + offset + 8
  const take = candidateWindow
  const announcementTake = Math.min(6, Math.max(2, Math.ceil((limit + offset) / 3)))
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const filterUserId = req.query.userId ? Number.parseInt(req.query.userId, 10) : null
  const userIdFilter =
    filterUserId && Number.isInteger(filterUserId) && filterUserId > 0
      ? { userId: filterUserId }
      : {}

  /* Feed cards display text-only previews (summarizeText), never rendered
   * HTML, so filtering by htmlRiskTier here is unnecessary and hides valid
   * content.  Security enforcement happens in the sheet viewer / HTML
   * preview endpoints which sandbox risky content appropriately. */
  const sheetWhere = search
    ? {
        status: 'published',
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : { status: 'published' }
  const postWhere = search ? { content: { contains: search, mode: 'insensitive' } } : undefined
  const announcementWhere = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
        ],
      }
    : undefined
  const noteWhere = search
    ? {
        private: false,
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }
    : { private: false }

  try {
    // Filter out content from blocked and muted users
    const userId = req.user?.userId
    let blockedIds = []
    let mutedIds = []
    try {
      ;[blockedIds, mutedIds] = await Promise.all([
        getBlockedUserIds(prisma, userId),
        getMutedUserIds(prisma, userId),
      ])
    } catch (filterErr) {
      // Graceful degradation: if block/mute tables unavailable, skip filtering
      log.error({ err: filterErr }, '[feed] block/mute filter failed, skipping')
      captureError(filterErr, { route: req.originalUrl, context: 'block-mute-filter' })
    }
    const hideUserIds = [...new Set([...blockedIds, ...mutedIds])]
    const userFilter = hideUserIds.length > 0 ? { userId: { notIn: hideUserIds } } : {}
    const authorFilter = hideUserIds.length > 0 ? { authorId: { notIn: hideUserIds } } : {}

    const primarySections = await Promise.all([
      settleSection('announcements', () =>
        prisma.announcement.findMany({
          where: { ...announcementWhere, ...authorFilter },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            media: {
              select: {
                id: true,
                type: true,
                url: true,
                position: true,
                videoId: true,
                fileName: true,
                fileSize: true,
                width: true,
                height: true,
                video: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    duration: true,
                    width: true,
                    height: true,
                    thumbnailR2Key: true,
                    variants: true,
                    r2Key: true,
                  },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
          orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
          take: announcementTake,
        }),
      ),
      settleSection('sheets', () =>
        prisma.studySheet.findMany({
          where: { ...sheetWhere, ...userFilter },
          select: {
            id: true,
            title: true,
            description: true,
            content: true,
            createdAt: true,
            stars: true,
            forks: true,
            downloads: true,
            attachmentUrl: true,
            attachmentName: true,
            attachmentType: true,
            allowDownloads: true,
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { id: true, code: true } },
            forkSource: {
              select: {
                id: true,
                title: true,
                author: { select: { id: true, username: true, avatarUrl: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take,
        }),
      ),
      settleSection('posts', () =>
        prisma.feedPost.findMany({
          where: { ...postWhere, ...userFilter, ...userIdFilter },
          select: {
            id: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            moderationStatus: true,
            attachmentUrl: true,
            attachmentName: true,
            attachmentType: true,
            allowDownloads: true,
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { id: true, code: true } },
            video: {
              select: {
                id: true,
                title: true,
                status: true,
                duration: true,
                width: true,
                height: true,
                thumbnailR2Key: true,
                variants: true,
                hlsManifestR2Key: true,
                r2Key: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take,
        }),
      ),
      settleSection('notes', () =>
        prisma.note.findMany({
          where: { ...noteWhere, ...userFilter },
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            moderationStatus: true,
            author: { select: { id: true, username: true, avatarUrl: true } },
            course: { select: { id: true, code: true } },
          },
          orderBy: { createdAt: 'desc' },
          take,
        }),
      ),
    ])

    const announcements =
      primarySections.find((section) => section.label === 'announcements' && section.ok)?.data || []
    const sheets =
      primarySections.find((section) => section.label === 'sheets' && section.ok)?.data || []
    const posts =
      primarySections.find((section) => section.label === 'posts' && section.ok)?.data || []
    const notes =
      primarySections.find((section) => section.label === 'notes' && section.ok)?.data || []

    const degradedSections = primarySections
      .filter((section) => !section.ok)
      .map((section) => `${section.label} temporarily unavailable`)

    primarySections.forEach((section) => {
      if (!section.ok) {
        log.error(
          { err: section.error, feedSection: section.label },
          `[feed] section "${section.label}" failed`,
        )
        captureError(section.error, {
          route: req.originalUrl,
          method: req.method,
          feedSection: section.label,
        })
      }
    })

    // If every section genuinely failed (DB errors), return 500.
    // If sections succeeded but returned 0 rows, that's a valid empty feed.
    const allSectionsFailed = primarySections.every((section) => !section.ok)
    if (allSectionsFailed) {
      log.error(
        {
          userId: req.user.userId,
          search,
          durations: primarySections.map((section) => ({
            label: section.label,
            ok: section.ok,
            durationMs: section.durationMs,
          })),
        },
        '[feed] all primary sections failed',
      )
      return sendError(res, 500, 'Could not load the feed right now.', ERROR_CODES.INTERNAL)
    }

    const sheetIds = sheets.map((sheet) => sheet.id)
    const postIds = posts.map((post) => post.id)
    const noteIds = notes.map((note) => note.id)

    const secondarySections = await Promise.all([
      settleSection('starredRows', () =>
        sheetIds.length > 0
          ? prisma.starredSheet.findMany({
              where: { userId: req.user.userId, sheetId: { in: sheetIds } },
              select: { sheetId: true },
            })
          : [],
      ),
      settleSection('sheetCommentRows', () =>
        sheetIds.length > 0
          ? prisma.comment.groupBy({
              by: ['sheetId'],
              where: { sheetId: { in: sheetIds } },
              _count: { _all: true },
            })
          : [],
      ),
      settleSection('postCommentRows', () =>
        postIds.length > 0
          ? prisma.feedPostComment.groupBy({
              by: ['postId'],
              where: { postId: { in: postIds } },
              _count: { _all: true },
            })
          : [],
      ),
      settleSection('sheetReactionRows', () =>
        sheetIds.length > 0
          ? prisma.reaction.groupBy({
              by: ['sheetId', 'type'],
              where: { sheetId: { in: sheetIds } },
              _count: { _all: true },
            })
          : [],
      ),
      settleSection('postReactionRows', () =>
        postIds.length > 0
          ? prisma.feedPostReaction.groupBy({
              by: ['postId', 'type'],
              where: { postId: { in: postIds } },
              _count: { _all: true },
            })
          : [],
      ),
      settleSection('currentSheetReactions', () =>
        sheetIds.length > 0
          ? prisma.reaction.findMany({
              where: { userId: req.user.userId, sheetId: { in: sheetIds } },
              select: { sheetId: true, type: true },
            })
          : [],
      ),
      settleSection('currentPostReactions', () =>
        postIds.length > 0
          ? prisma.feedPostReaction.findMany({
              where: { userId: req.user.userId, postId: { in: postIds } },
              select: { postId: true, type: true },
            })
          : [],
      ),
      settleSection('noteCommentRows', () =>
        noteIds.length > 0
          ? prisma.noteComment.groupBy({
              by: ['noteId'],
              where: { noteId: { in: noteIds } },
              _count: { _all: true },
            })
          : [],
      ),
    ])

    secondarySections
      .filter((section) => !section.ok)
      .forEach((section) => {
        degradedSections.push(`${section.label} temporarily unavailable`)
        captureError(section.error, {
          route: req.originalUrl,
          method: req.method,
          feedSection: section.label,
        })
      })

    const starredRows =
      secondarySections.find((section) => section.label === 'starredRows' && section.ok)?.data || []
    const sheetCommentRows =
      secondarySections.find((section) => section.label === 'sheetCommentRows' && section.ok)
        ?.data || []
    const postCommentRows =
      secondarySections.find((section) => section.label === 'postCommentRows' && section.ok)
        ?.data || []
    const sheetReactionRows =
      secondarySections.find((section) => section.label === 'sheetReactionRows' && section.ok)
        ?.data || []
    const postReactionRows =
      secondarySections.find((section) => section.label === 'postReactionRows' && section.ok)
        ?.data || []
    const currentSheetReactions =
      secondarySections.find((section) => section.label === 'currentSheetReactions' && section.ok)
        ?.data || []
    const currentPostReactions =
      secondarySections.find((section) => section.label === 'currentPostReactions' && section.ok)
        ?.data || []
    const noteCommentRows =
      secondarySections.find((section) => section.label === 'noteCommentRows' && section.ok)
        ?.data || []

    const starredIds = new Set(starredRows.map((row) => row.sheetId))
    const sheetCommentCounts = new Map(
      sheetCommentRows.map((row) => [row.sheetId, row._count._all]),
    )
    const postCommentCounts = new Map(postCommentRows.map((row) => [row.postId, row._count._all]))
    const noteCommentCounts = new Map(noteCommentRows.map((row) => [row.noteId, row._count._all]))

    const merged = [
      ...announcements.map(formatAnnouncement),
      ...posts.map((post) =>
        formatPost(post, postCommentCounts, postReactionRows, currentPostReactions),
      ),
      ...sheets.map((sheet) =>
        formatSheet(
          sheet,
          starredIds,
          sheetCommentCounts,
          sheetReactionRows,
          currentSheetReactions,
        ),
      ),
      ...notes.map((note) => formatNote(note, noteCommentCounts)),
    ]

    // Build personalization context for authenticated users. Includes the
    // viewer's enrolled courses, followed users, and school memberships so
    // the scorer can apply the follow / same-school / course boosts.
    let userContext = null
    if (req.user?.userId && sortMode === 'ranked') {
      try {
        const [enrollments, follows, schoolEnrollments] = await Promise.all([
          prisma.enrollment.findMany({
            where: { userId: req.user.userId },
            select: { courseId: true },
          }),
          prisma.userFollow.findMany({
            where: { followerId: req.user.userId, status: 'active' },
            select: { followingId: true },
          }),
          prisma.userSchoolEnrollment.findMany({
            where: { userId: req.user.userId },
            select: { schoolId: true },
          }),
        ])
        userContext = {
          courseIds: new Set(enrollments.map((e) => e.courseId)),
          followingIds: new Set(follows.map((f) => f.followingId)),
          schoolIds: new Set(schoolEnrollments.map((s) => s.schoolId)),
        }
      } catch (err) {
        // Non-fatal - proceed without personalization
        captureError(err, {
          context: 'feed.personalizationContext',
          route: req.originalUrl,
          method: req.method,
        })
      }
    }

    // For ranked mode with a school-aware boost, hydrate per-author school
    // memberships in one round-trip. Without this `authorSchoolIds` is null
    // and the boost simply doesn't fire — so the loss is graceful, not a
    // regression. We only run the query when there's a viewer school set.
    if (
      sortMode === 'ranked' &&
      userContext?.schoolIds &&
      userContext.schoolIds.size > 0 &&
      merged.length > 0
    ) {
      try {
        const authorIds = [
          ...new Set(
            merged
              .map((item) => item.author?.id || item.user?.id)
              .filter((id) => Number.isInteger(id) && id > 0),
          ),
        ]
        if (authorIds.length > 0) {
          const authorSchoolRows = await prisma.userSchoolEnrollment.findMany({
            where: { userId: { in: authorIds } },
            select: { userId: true, schoolId: true },
          })
          const byAuthor = new Map()
          for (const row of authorSchoolRows) {
            const list = byAuthor.get(row.userId) || []
            list.push(row.schoolId)
            byAuthor.set(row.userId, list)
          }
          for (const item of merged) {
            const authorId = item.author?.id || item.user?.id
            if (authorId && byAuthor.has(authorId)) {
              item.authorSchoolIds = byAuthor.get(authorId)
            }
          }
        }
      } catch (err) {
        // Non-fatal — same-school boost just doesn't fire on this request.
        captureError(err, {
          context: 'feed.authorSchoolHydrate',
          route: req.originalUrl,
          method: req.method,
        })
      }
    }

    if (sortMode === 'recent') {
      // Legacy behaviour: pure createdAt DESC with pinned announcements first.
      merged.sort((a, b) => {
        if (a.type === 'announcement' && b.type === 'announcement') {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        } else if (a.type === 'announcement' && a.pinned) {
          return -1
        } else if (b.type === 'announcement' && b.pinned) {
          return 1
        }
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bTime - aTime
      })
    } else {
      merged.sort((a, b) => {
        // Pinned announcements always float to the top
        if (a.type === 'announcement' && b.type === 'announcement') {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        } else if (a.type === 'announcement' && a.pinned) {
          return -1
        } else if (b.type === 'announcement' && b.pinned) {
          return 1
        }

        return scoreFeedItem(b, userContext) - scoreFeedItem(a, userContext)
      })
    }

    const items = merged

    // Enrich feed item authors with Pro/Donor badge data. Strip the
    // server-only `authorSchoolIds` hydration field before returning so we
    // never leak per-author school memberships to clients (defence-in-depth
    // for the same-school boost — only the boost should ever see it).
    const slicedItems = items.slice(offset, offset + limit).map((item) => {
      if (item.authorSchoolIds) {
        const { authorSchoolIds: _stripped, ...rest } = item
        return rest
      }
      return item
    })
    try {
      const authorMap = new Map()
      for (const item of slicedItems) {
        const author = item.author || item.user
        if (author?.id) authorMap.set(author.id, author)
      }
      if (authorMap.size > 0) {
        const authors = Array.from(authorMap.values())
        const enriched = await enrichUsersWithBadges(authors)
        const badgeMap = new Map(enriched.map((u) => [u.id, u]))
        for (const item of slicedItems) {
          const author = item.author || item.user
          if (author?.id && badgeMap.has(author.id)) {
            const b = badgeMap.get(author.id)
            author.plan = b.plan
            author.isDonor = b.isDonor
            author.donorLevel = b.donorLevel
          }
        }
      }
    } catch {
      // Non-fatal: badges degrade gracefully
    }

    const payload = {
      items: slicedItems,
      total: items.length,
      limit,
      offset,
      partial: degradedSections.length > 0,
      degradedSections,
    }

    log.info(
      {
        event: 'feed.loaded',
        userId: req.user.userId,
        search,
        sortMode,
        durationMs: Date.now() - startedAt,
        partial: payload.partial,
        counts: {
          announcements: announcements.length,
          posts: posts.length,
          sheets: sheets.length,
          notes: notes.length,
          returned: payload.items.length,
        },
        timings: [...primarySections, ...secondarySections].map((section) => ({
          label: section.label,
          ok: section.ok,
          durationMs: section.durationMs,
        })),
      },
      '[feed] loaded',
    )

    res.json(payload)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// Default export is the express Router; the named exports power unit tests.
// Express ignores extra fields on a router instance, so attaching them here
// keeps `require('./feed.list.controller')` returning the router exactly as
// before — no `module.exports = { router, ... }` rewrite needed.
module.exports = router
module.exports.scoreFeedItem = scoreFeedItem
module.exports.ALLOWED_SORT_MODES = ALLOWED_SORT_MODES
