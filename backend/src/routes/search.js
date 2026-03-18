const express = require('express')
const rateLimit = require('express-rate-limit')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')

const router = express.Router()

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many search requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.use(searchLimiter)

const VALID_TYPES = ['all', 'sheets', 'courses', 'users']

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
  const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
  const rawType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit

  const query = (rawQ || '').trim()
  const type = rawType || 'all'

  if (!query || query.length < 2) {
    return res.json({ results: { sheets: [], courses: [], users: [] }, query, type })
  }

  if (query.length > 200) {
    return res.status(400).json({ error: 'Search query too long (max 200 characters).' })
  }

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid search type. Must be one of: ${VALID_TYPES.join(', ')}` })
  }

  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 8, 1), 20)

  try {
    const promises = []

    const wantSheets = type === 'all' || type === 'sheets'
    const wantCourses = type === 'all' || type === 'courses'
    const wantUsers = type === 'all' || type === 'users'

    if (wantSheets) {
      promises.push(
        prisma.studySheet.findMany({
          where: {
            status: 'published',
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
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
      )
    } else {
      promises.push(Promise.resolve([]))
    }

    if (wantCourses) {
      promises.push(
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
      )
    } else {
      promises.push(Promise.resolve([]))
    }

    if (wantUsers) {
      promises.push(
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
          take: limit,
        })
      )
    } else {
      promises.push(Promise.resolve([]))
    }

    const [sheets, courses, users] = await Promise.all(promises)

    return res.json({
      results: { sheets, courses, users },
      query,
      type,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
