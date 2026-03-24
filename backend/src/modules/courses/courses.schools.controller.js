const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { schoolsLimiter, POPULAR_COURSES_LIMIT } = require('./courses.constants')

const router = express.Router()

// Public endpoint for school + course dropdowns.
router.get('/schools', schoolsLimiter, async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        name: true,
        short: true,
        city: true,
        state: true,
        schoolType: true,
        courses: {
          select: {
            id: true,
            code: true,
            name: true,
            department: true,
          },
          orderBy: { code: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    })

    return res.json(schools)
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method
    })

    console.error(error)
    return res.status(500).json({ error: 'Server error.' })
  }
})

// Public endpoint for popular courses ranked by published sheet count.
router.get('/popular', schoolsLimiter, async (req, res) => {
  try {
    const grouped = await prisma.studySheet.groupBy({
      by: ['courseId'],
      where: { status: 'published', courseId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: POPULAR_COURSES_LIMIT,
    })

    const courseIds = grouped.map((row) => row.courseId)

    if (courseIds.length === 0) {
      return res.json([])
    }

    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: {
        id: true,
        code: true,
        name: true,
        school: { select: { id: true, name: true, short: true } },
      },
    })

    const countMap = new Map(grouped.map((row) => [row.courseId, row._count._all]))
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
})

module.exports = router
