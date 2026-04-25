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

/**
 * Score a feed item by weighted engagement signals + recency.
 * Higher score = shown higher in feed.
 */
function scoreFeedItem(item, userContext = null) {
  const likes = item.reactionSummary?.likes || item.stars || 0
  const dislikes = item.reactionSummary?.dislikes || 0
  const comments = item.commentCount || 0
  const forks = item.forkCount || 0
  const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60)
  const recencyBoost = Math.max(0, 1 - ageHours / 720) * 15
  let score = likes * 3 + dislikes * -1 + comments * 5 + forks * 8 + recencyBoost

  // Personalization boosts when user context is available
  if (userContext) {
    const courseId = item.course?.id || item.courseId
    const authorId = item.author?.id || item.user?.id || item.authorId

    // Boost content from user's enrolled courses
    if (userContext.courseIds && courseId && userContext.courseIds.has(courseId)) {
      score *= 1.4
    }
    // Boost content from followed users
    if (userContext.followingIds && authorId && userContext.followingIds.has(authorId)) {
      score *= 1.3
    }
  }

  return score
}

router.get('/', async (req, res) => {
  const startedAt = Date.now()
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)
  const take = limit + offset + 8
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

    // Build personalization context for authenticated users
    let userContext = null
    if (req.user?.userId) {
      try {
        const [enrollments, follows] = await Promise.all([
          prisma.enrollment.findMany({
            where: { userId: req.user.userId },
            select: { courseId: true },
          }),
          prisma.userFollow.findMany({
            where: { followerId: req.user.userId, status: 'active' },
            select: { followingId: true },
          }),
        ])
        userContext = {
          courseIds: new Set(enrollments.map((e) => e.courseId)),
          followingIds: new Set(follows.map((f) => f.followingId)),
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

    const items = merged

    // Enrich feed item authors with Pro/Donor badge data
    const slicedItems = items.slice(offset, offset + limit)
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
        userId: req.user.userId,
        search,
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

module.exports = router
