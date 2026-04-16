const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { cacheControl } = require('../../lib/cacheControl')
const prisma = require('../../lib/prisma')
const { schoolsLimiter, POPULAR_COURSES_LIMIT } = require('./courses.constants')

const router = express.Router()

// Public endpoint for school + course dropdowns.
router.get(
  '/schools',
  cacheControl(600, { public: true, staleWhileRevalidate: 1800 }),
  schoolsLimiter,
  async (req, res) => {
    try {
      const schools = await prisma.school.findMany({
        select: {
          id: true,
          name: true,
          short: true,
          city: true,
          state: true,
          schoolType: true,
          logoUrl: true,
          courses: {
            select: {
              id: true,
              code: true,
              name: true,
              department: true,
            },
            orderBy: { code: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })

      return res.json(schools)
    } catch (error) {
      captureError(error, {
        route: req.originalUrl,
        method: req.method,
      })

      console.error(error)
      return res.status(500).json({ error: 'Server error.' })
    }
  },
)

// Public endpoint for popular courses ranked by published sheet count.
router.get(
  '/popular',
  cacheControl(300, { public: true, staleWhileRevalidate: 600 }),
  schoolsLimiter,
  async (req, res) => {
    try {
      // StudySheet.courseId is a non-nullable Int in the schema, so no
      // null-exclusion filter is needed (and Prisma 6.19+ rejects the
      // `NOT: [{ courseId: null }]` form on required fields). Grouping
      // uses a concrete column count since `_all` was removed in 6.19.
      const grouped = await prisma.studySheet.groupBy({
        by: ['courseId'],
        where: { status: 'published' },
        _count: { courseId: true },
        orderBy: { _count: { courseId: 'desc' } },
        take: POPULAR_COURSES_LIMIT,
      })

      const courseIds = grouped.map((row) => row.courseId)

      if (courseIds.length === 0) return res.json([])

      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: {
          id: true,
          code: true,
          name: true,
          school: { select: { id: true, name: true, short: true } },
        },
      })

      const countMap = new Map(grouped.map((row) => [row.courseId, row._count.courseId]))
      const courseMap = new Map(courses.map((course) => [course.id, course]))

      const result = courseIds
        .map((id) => {
          const course = courseMap.get(id)
          if (!course) return null
          return {
            id: course.id,
            code: course.code,
            name: course.name,
            school: course.school,
            sheetCount: countMap.get(id) || 0,
          }
        })
        .filter(Boolean)

      return res.json(result)
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      console.error(error)
      return res.status(500).json({ error: 'Server error.' })
    }
  },
)

/**
 * GET /api/courses/schools/suggest
 * Returns school matching the authenticated user's email domain (if .edu).
 */
router.get('/schools/suggest', requireAuth, async (req, res) => {
  try {
    const email = req.user?.email
    if (!email) return res.json({ school: null })

    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain || !domain.endsWith('.edu')) return res.json({ school: null })

    const school = await prisma.school.findFirst({
      where: { emailDomain: domain },
      select: {
        id: true,
        name: true,
        short: true,
        city: true,
        state: true,
        logoUrl: true,
      },
    })

    return res.json({ school: school || null })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
