const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { parsePositiveInt } = require('../../core/http/validate')
const { SHEET_STATUS, AUTHOR_SELECT, leaderboardLimiter } = require('./sheets.constants')
const { serializeSheet } = require('./sheets.serializer')
const { buildSheetTextSearchClauses } = require('../../lib/sheetSearch')
const { searchSheetsFTS } = require('../../lib/fullTextSearch')
const { cache } = require('../../lib/cache')
/* RISK_TIER removed — sheet listings no longer filter by htmlRiskTier
 * (security enforcement is in the sheet viewer / HTML preview endpoints) */

const router = express.Router()

router.get('/leaderboard', leaderboardLimiter, async (req, res) => {
  const type = req.query.type || 'stars'
  const cacheKey = `sheet-leaderboard:${type}`

  try {
    const cached = cache.get(cacheKey)
    if (cached) {
      return res.json(cached)
    }

    let result

    if (type === 'contributors') {
      const contributors = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          _count: { select: { studySheets: true } },
        },
        where: {
          studySheets: {
            some: { status: SHEET_STATUS.PUBLISHED },
          },
        },
        orderBy: { studySheets: { _count: 'desc' } },
        take: 5,
      })

      result = contributors.map((user) => ({
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        count: user._count.studySheets,
      }))
    } else {
      const orderField = type === 'downloads' ? 'downloads' : 'stars'
      result = await prisma.studySheet.findMany({
        select: {
          id: true,
          title: true,
          stars: true,
          downloads: true,
          allowDownloads: true,
          author: { select: AUTHOR_SELECT },
          course: { select: { code: true } },
        },
        where: { status: SHEET_STATUS.PUBLISHED },
        orderBy: { [orderField]: 'desc' },
        take: 5,
      })
    }

    cache.set(cacheKey, result, 5 * 60 * 1000)
    res.json(result)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/', optionalAuth, async (req, res) => {
  const {
    courseId,
    schoolId,
    search,
    format,
    mine,
    starred,
    limit = 20,
    offset = 0,
    orderBy: orderByParam = 'createdAt',
    sort,
  } = req.query

  try {
    const where = {}
    const includeUnpublishedMine = mine === '1'

    if (includeUnpublishedMine) {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })
      where.userId = req.user.userId

      const validStatuses = Object.values(SHEET_STATUS)
      const statusParam =
        typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : ''
      if (statusParam && validStatuses.includes(statusParam)) {
        where.status = statusParam
      }
    } else {
      where.status = SHEET_STATUS.PUBLISHED
    }

    if (courseId) where.courseId = Number.parseInt(courseId, 10)
    if (schoolId) where.course = { schoolId: Number.parseInt(schoolId, 10) }

    const formatCandidate = typeof format === 'string' ? format.trim().toLowerCase() : ''
    if (formatCandidate === 'html') {
      where.contentFormat = 'html'
    } else if (formatCandidate === 'pdf') {
      where.attachmentType = { contains: 'pdf', mode: 'insensitive' }
    } else if (formatCandidate === 'richtext') {
      where.contentFormat = 'richtext'
    } else if (formatCandidate === 'markdown') {
      where.contentFormat = 'markdown'
      where.NOT = { attachmentType: { contains: 'pdf', mode: 'insensitive' } }
    }

    const sheetTextSearchClauses = buildSheetTextSearchClauses(search)
    if (sheetTextSearchClauses.length) {
      where.OR = sheetTextSearchClauses
    }

    const allowedSort = ['createdAt', 'stars', 'downloads', 'forks', 'updatedAt', 'recommended']
    const sortCandidate = typeof sort === 'string' && sort.trim() ? sort : orderByParam
    const sortField = allowedSort.includes(sortCandidate) ? sortCandidate : 'createdAt'
    const take = parsePositiveInt(limit, 20)
    const skip = Math.max(0, Number.parseInt(offset, 10) || 0)

    if (starred === '1') {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })

      const starredRows = await prisma.starredSheet.findMany({
        where: { userId: req.user.userId, sheet: where },
        select: { sheetId: true },
        orderBy: { sheetId: 'desc' },
        take,
        skip,
      })
      const starredSheetIds = [...new Set(starredRows.map((row) => row.sheetId))]
      const totalStarred = await prisma.starredSheet.count({
        where: { userId: req.user.userId, sheet: where },
      })

      const starredOrderBy =
        sortField === 'recommended' ? { createdAt: 'desc' } : { [sortField]: 'desc' }
      const sheets = await prisma.studySheet.findMany({
        where: { id: { in: starredSheetIds } },
        include: {
          author: { select: AUTHOR_SELECT },
          course: { include: { school: true } },
          forkSource: {
            select: {
              id: true,
              title: true,
              userId: true,
              author: { select: AUTHOR_SELECT },
            },
          },
        },
        orderBy: starredOrderBy,
      })

      const comments = await prisma.comment.groupBy({
        by: ['sheetId'],
        where: { sheetId: { in: starredSheetIds } },
        _count: { _all: true },
      })
      const commentCountBySheetId = new Map(comments.map((row) => [row.sheetId, row._count._all]))

      const ordered = sheets.map((sheet) =>
        serializeSheet(sheet, {
          starred: true,
          commentCount: commentCountBySheetId.get(sheet.id) || 0,
        }),
      )

      return res.json({ sheets: ordered, total: totalStarred, limit: take, offset: skip })
    }

    /* ── Full-text search path (opt-in via ?fts=true) ──────────────── */
    const useFTS = req.query.fts === 'true'
    if (useFTS && search && String(search).trim().length >= 2) {
      const ftsPage = Math.max(1, Math.floor(skip / take) + 1)
      const ftsResult = await searchSheetsFTS(search, {
        courseId: courseId ? Number.parseInt(courseId, 10) : undefined,
        userId: includeUnpublishedMine ? req.user.userId : undefined,
        status: includeUnpublishedMine ? undefined : SHEET_STATUS.PUBLISHED,
        page: ftsPage,
        limit: take,
      })

      const ftsSheetIds = ftsResult.sheets.map((s) => s.id)

      /* Hydrate with full Prisma relations for consistent serialization */
      const hydratedSheets =
        ftsSheetIds.length > 0
          ? await prisma.studySheet.findMany({
              where: { id: { in: ftsSheetIds } },
              include: {
                author: { select: AUTHOR_SELECT },
                course: { include: { school: true } },
                forkSource: {
                  select: {
                    id: true,
                    title: true,
                    userId: true,
                    author: { select: AUTHOR_SELECT },
                  },
                },
              },
            })
          : []

      /* Preserve rank ordering from the FTS query */
      const hydratedById = new Map(hydratedSheets.map((s) => [s.id, s]))
      const orderedSheets = ftsSheetIds.map((id) => hydratedById.get(id)).filter(Boolean)

      const [ftsStarredRows, ftsCommentRows] = await Promise.all([
        req.user && ftsSheetIds.length > 0
          ? prisma.starredSheet.findMany({
              where: { userId: req.user.userId, sheetId: { in: ftsSheetIds } },
              select: { sheetId: true },
            })
          : [],
        ftsSheetIds.length > 0
          ? prisma.comment.groupBy({
              by: ['sheetId'],
              where: { sheetId: { in: ftsSheetIds } },
              _count: { _all: true },
            })
          : [],
      ])

      const ftsStarredIds = new Set(ftsStarredRows.map((r) => r.sheetId))
      const ftsCommentMap = new Map(ftsCommentRows.map((r) => [r.sheetId, r._count._all]))

      return res.json({
        sheets: orderedSheets.map((sheet) =>
          serializeSheet(sheet, {
            starred: ftsStarredIds.has(sheet.id),
            commentCount: ftsCommentMap.get(sheet.id) || 0,
          }),
        ),
        total: ftsResult.total,
        limit: take,
        offset: skip,
        fts: true,
      })
    }

    /* ── Recommended sort: composite score ───────────────────────────── */
    const useRecommended = sortField === 'recommended'

    const sheetInclude = {
      author: { select: AUTHOR_SELECT },
      course: { include: { school: true } },
      forkSource: {
        select: {
          id: true,
          title: true,
          userId: true,
          author: { select: AUTHOR_SELECT },
        },
      },
    }

    const [sheets, total] = await Promise.all([
      useRecommended
        ? prisma.studySheet.findMany({
            where,
            include: sheetInclude,
            orderBy: { createdAt: 'desc' },
            take: Math.min(take + skip + 50, 200),
          })
        : prisma.studySheet.findMany({
            where,
            include: sheetInclude,
            orderBy: { [sortField]: 'desc' },
            take,
            skip,
          }),
      prisma.studySheet.count({ where }),
    ])

    /* Score + re-sort + paginate for recommended mode */
    const rankedSheets = useRecommended
      ? (() => {
          const now = Date.now()
          const DAY_MS = 86400000
          const scored = sheets.map((sheet) => {
            const ageDays = Math.max(1, (now - new Date(sheet.createdAt).getTime()) / DAY_MS)
            const freshness = Math.max(0, 10 - Math.log2(ageDays))
            const score =
              (sheet.stars || 0) * 3 + (sheet.forks || 0) * 2 + (sheet.downloads || 0) + freshness
            return { sheet, score }
          })
          scored.sort((a, b) => b.score - a.score)
          return scored.slice(skip, skip + take).map((s) => s.sheet)
        })()
      : sheets

    const finalSheets = rankedSheets
    const sheetIds = finalSheets.map((sheet) => sheet.id)
    const [starredRows, commentRows] = await Promise.all([
      req.user
        ? prisma.starredSheet.findMany({
            where: { userId: req.user.userId, sheetId: { in: sheetIds } },
            select: { sheetId: true },
          })
        : [],
      sheetIds.length > 0
        ? prisma.comment.groupBy({
            by: ['sheetId'],
            where: { sheetId: { in: sheetIds } },
            _count: { _all: true },
          })
        : [],
    ])

    const starredIds = new Set(starredRows.map((row) => row.sheetId))
    const commentCountBySheetId = new Map(commentRows.map((row) => [row.sheetId, row._count._all]))

    res.json({
      sheets: finalSheets.map((sheet) =>
        serializeSheet(sheet, {
          starred: starredIds.has(sheet.id),
          commentCount: commentCountBySheetId.get(sheet.id) || 0,
        }),
      ),
      total,
      limit: take,
      offset: skip,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
