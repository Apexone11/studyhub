const express = require('express')
const rateLimit = require('express-rate-limit')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')
const { getVisibleProfileIds } = require('../../lib/profileVisibility')
const { buildSheetTextSearchClauses } = require('../../lib/sheetSearch')
const { searchSheetsFTS, searchCoursesFTS, searchUsersFTS } = require('../../lib/fullTextSearch')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { timedSection, logTiming } = require('../../lib/requestTiming')

const router = express.Router()

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many search requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.use(searchLimiter)

const VALID_TYPES = ['all', 'sheets', 'courses', 'users', 'notes']

// Optional auth — attach user if token present, but don't require it
function optionalAuth(req, _res, next) {
  const token = getAuthTokenFromRequest(req)
  if (token) {
    try {
      req.user = verifyAuthToken(token)
    } catch {
      // ignore — unauthenticated search is fine
    }
  }
  next()
}

router.get('/', optionalAuth, async (req, res) => {
  req._timingStart = Date.now()
  const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
  const rawType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit

  const query = (rawQ || '').trim()
  const type = rawType || 'all'

  if (!query || query.length < 2) {
    return res.json({ results: { sheets: [], courses: [], users: [], notes: [] }, query, type })
  }

  if (query.length > 200) {
    return res.status(400).json({ error: 'Search query too long (max 200 characters).' })
  }

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid search type. Must be one of: ${VALID_TYPES.join(', ')}` })
  }

  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 8, 1), 20)

  const useFTS = req.query.fts === 'true'

  try {
    const sections = []
    const sheetTextSearchClauses = buildSheetTextSearchClauses(query)

    const wantSheets = type === 'all' || type === 'sheets'
    const wantCourses = type === 'all' || type === 'courses'
    const wantUsers = type === 'all' || type === 'users'
    const wantNotes = type === 'all' || type === 'notes'
    const userSearchTake = Math.min(limit * 5, 50)

    if (wantSheets) {
      if (useFTS) {
        sections.push(timedSection('sheets-fts', () =>
          searchSheetsFTS(query, { status: 'published', limit }).then(async (result) => {
            if (!result.sheets.length) return []
            const ids = result.sheets.map((s) => Number(s.id))
            return prisma.studySheet.findMany({
              where: { id: { in: ids } },
              select: {
                id: true, title: true, description: true, stars: true,
                downloads: true, createdAt: true,
                course: { select: { id: true, code: true, name: true } },
                author: { select: { id: true, username: true } },
              },
            })
          })
        ))
      } else {
        sections.push(timedSection('sheets', () =>
          prisma.studySheet.findMany({
            where: {
              status: 'published',
              OR: sheetTextSearchClauses,
            },
            select: {
              id: true,
              title: true,
              description: true,
              stars: true,
              downloads: true,
              createdAt: true,
              course: { select: { id: true, code: true, name: true } },
              author: { select: { id: true, username: true } },
            },
            orderBy: { stars: 'desc' },
            take: limit,
          })
        ))
      }
    } else {
      sections.push(timedSection('sheets-skip', () => []))
    }

    if (wantCourses) {
      if (useFTS) {
        sections.push(timedSection('courses-fts', () =>
          searchCoursesFTS(query, { limit }).then(async (rows) => {
            if (!rows.length) return []
            const ids = rows.map((c) => Number(c.id))
            return prisma.course.findMany({
              where: { id: { in: ids } },
              select: {
                id: true, code: true, name: true,
                school: { select: { id: true, name: true, short: true } },
              },
            })
          })
        ))
      } else {
        sections.push(timedSection('courses', () =>
          prisma.course.findMany({
            where: {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { name: { contains: query, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              code: true,
              name: true,
              school: { select: { id: true, name: true, short: true } },
            },
            orderBy: { code: 'asc' },
            take: limit,
          })
        ))
      }
    } else {
      sections.push(timedSection('courses-skip', () => []))
    }

    if (wantUsers) {
      if (useFTS) {
        sections.push(timedSection('users-fts', () =>
          searchUsersFTS(query, { limit: userSearchTake }).then(async (rows) => {
            if (!rows.length) return []
            const ids = rows.map((u) => Number(u.id))
            return prisma.user.findMany({
              where: { id: { in: ids } },
              select: {
                id: true, username: true, role: true,
                avatarUrl: true, createdAt: true,
              },
            })
          })
        ))
      } else {
        sections.push(timedSection('users', () =>
          prisma.user.findMany({
            where: {
              username: { contains: query, mode: 'insensitive' },
            },
            select: {
              id: true,
              username: true,
              role: true,
              avatarUrl: true,
              createdAt: true,
            },
            orderBy: { username: 'asc' },
            take: userSearchTake,
          })
        ))
      }
    } else {
      sections.push(timedSection('users-skip', () => []))
    }

    if (wantNotes) {
      sections.push(timedSection('notes', () =>
        prisma.note.findMany({
          where: {
            private: false,
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { content: { contains: query, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            title: true,
            createdAt: true,
            course: { select: { id: true, code: true, name: true } },
            author: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
      ))
    } else {
      sections.push(timedSection('notes-skip', () => []))
    }

    const resolved = await Promise.all(sections)
    const sheets = resolved[0].data || []
    const courses = resolved[1].data || []
    const matchedUsers = resolved[2].data || []
    const notes = resolved[3].data || []
    let users = matchedUsers

    if (wantUsers && matchedUsers.length) {
      const visibilitySection = await timedSection('visibility', () =>
        getVisibleProfileIds(prisma, req.user, matchedUsers.map((user) => user.id))
      )
      resolved.push(visibilitySection)

      const visibleUserIds = visibilitySection.data
      users = matchedUsers
        .filter((user) => visibleUserIds.has(user.id))
        .slice(0, limit)
    }

    logTiming(req, {
      sections: resolved,
      extra: {
        query: query.slice(0, 50),
        type,
        useFTS,
        counts: { sheets: sheets.length, courses: courses.length, users: users.length, notes: notes.length },
      },
    })

    return res.json({
      results: { sheets, courses, users, notes },
      query,
      type,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
