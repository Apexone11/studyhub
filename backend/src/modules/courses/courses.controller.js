const express = require('express')
const requireAuth = require('../../middleware/auth')
const { sendForbidden } = require('../../lib/accessControl')
const { sendCourseRequestNotice } = require('../../lib/email/email')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { writeLimiter } = require('../../lib/rateLimiters')
const {
  POPULAR_THRESHOLD,
  RECOMMENDATION_LIMIT,
  parseOptionalInteger,
} = require('./courses.constants')

const router = express.Router()

// Course recommendations based on overlapping enrollments.
router.get('/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId

    const myEnrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })

    const myCourseIds = myEnrollments.map((enrollment) => enrollment.courseId)

    if (myCourseIds.length === 0) {
      const popular = await prisma.enrollment.groupBy({
        by: ['courseId'],
        _count: { courseId: true },
        orderBy: { _count: { courseId: 'desc' } },
        take: RECOMMENDATION_LIMIT,
      })

      const popularCourseIds = popular.map((entry) => entry.courseId)
      const courses = await prisma.course.findMany({
        where: { id: { in: popularCourseIds } },
        include: { school: true },
      })

      const popularMap = new Map(
        popular.map((entry) => [entry.courseId, entry._count?.courseId || 0]),
      )
      const withScores = courses
        .map((course) => ({
          ...course,
          score: popularMap.get(course.id) || 0,
        }))
        .sort((a, b) => b.score - a.score)

      return res.json({ type: 'popular', recommendations: withScores })
    }

    const similarUsers = await prisma.enrollment.findMany({
      where: {
        courseId: { in: myCourseIds },
        userId: { not: userId },
      },
      select: { userId: true },
      distinct: ['userId'],
      take: 500,
    })

    const similarUserIds = similarUsers.map((user) => user.userId)

    if (similarUserIds.length === 0) {
      return res.json({ type: 'none', recommendations: [] })
    }

    const theirEnrollments = await prisma.enrollment.groupBy({
      by: ['courseId'],
      where: {
        userId: { in: similarUserIds },
        courseId: { notIn: myCourseIds },
      },
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: RECOMMENDATION_LIMIT,
    })

    const recommended = await prisma.course.findMany({
      where: { id: { in: theirEnrollments.map((enrollment) => enrollment.courseId) } },
      include: { school: true },
    })

    const enrollmentMap = new Map(
      theirEnrollments.map((enrollment) => [enrollment.courseId, enrollment._count?.courseId || 0]),
    )
    const withScores = recommended
      .map((course) => ({
        ...course,
        score: enrollmentMap.get(course.id) || 0,
      }))
      .sort((a, b) => b.score - a.score)

    return res.json({ type: 'collaborative', recommendations: withScores })
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method,
    })

    console.error(error)
    return res.status(500).json({ error: 'Server error.' })
  }
})

// Track requests for courses that are not yet available.
// writeLimiter caps this at 60/min/user — without it an authenticated user
// could spam thousands of distinct RequestedCourse rows by varying the name
// payload (each unique name is its own row, count updates on duplicates).
router.post('/request', requireAuth, writeLimiter, async (req, res) => {
  const body = req.body || {}
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  const rawCode = typeof body.code === 'string' ? body.code.trim() : ''

  if (rawName.length < 2) {
    return res.status(400).json({ error: 'Course name is required.' })
  }
  if (rawName.length > 200) {
    return res.status(400).json({ error: 'Course name must be 200 characters or fewer.' })
  }

  let parsedSchoolId

  try {
    parsedSchoolId = parseOptionalInteger(body.schoolId, 'schoolId')
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  try {
    const existing = await prisma.requestedCourse.findFirst({
      where: {
        name: { equals: rawName, mode: 'insensitive' },
        schoolId: parsedSchoolId,
      },
    })

    let result

    if (existing) {
      const newCount = existing.count + 1
      result = await prisma.requestedCourse.update({
        where: { id: existing.id },
        data: {
          count: newCount,
          flagged: newCount >= POPULAR_THRESHOLD,
        },
      })
    } else {
      result = await prisma.requestedCourse.create({
        data: {
          name: rawName,
          code: rawCode || null,
          schoolId: parsedSchoolId,
          count: 1,
          flagged: false,
        },
      })
    }

    const message = result.flagged
      ? `"${rawName}" has been flagged for review and will likely be added soon!`
      : `"${rawName}" has been requested. We'll add it when it's popular enough.`

    try {
      const [requester, school] = await Promise.all([
        prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { username: true, email: true },
        }),
        parsedSchoolId === null
          ? Promise.resolve(null)
          : prisma.school.findUnique({
              where: { id: parsedSchoolId },
              select: { name: true, short: true },
            }),
      ])

      await sendCourseRequestNotice({
        courseName: rawName,
        courseCode: rawCode || null,
        schoolName: school ? `${school.short} - ${school.name}` : null,
        requesterUsername: requester?.username || req.user.username,
        requesterEmail: requester?.email || null,
        requestCount: result.count,
        flagged: result.flagged,
      })
    } catch (emailError) {
      captureError(emailError, {
        route: req.originalUrl,
        method: req.method,
        source: 'sendCourseRequestNotice',
      })
      console.error('Course request notification failed:', emailError.message || 'unknown error')
    }

    return res.status(201).json({
      message,
      request: result,
      threshold: POPULAR_THRESHOLD,
    })
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method,
    })

    console.error('Course request failed:', error.message || 'unknown error')
    return res.status(500).json({ error: 'Server error.' })
  }
})

// Admin view of all requested courses.
router.get('/requested', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return sendForbidden(res, 'Admins only.')
    }

    const requested = await prisma.requestedCourse.findMany({
      orderBy: [{ flagged: 'desc' }, { count: 'desc' }],
    })

    return res.json({
      total: requested.length,
      flagged: requested.filter((course) => course.flagged).length,
      courses: requested,
    })
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method,
    })

    console.error(error)
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
