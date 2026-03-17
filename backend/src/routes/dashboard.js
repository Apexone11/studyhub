const express = require('express')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(requireAuth)

router.get('/summary', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        avatarUrl: true,
        email: true,
        emailVerified: true,
        _count: {
          select: {
            enrollments: true,
            studySheets: true,
          },
        },
        enrollments: {
          // Enrollment rows do not track timestamps, so keep the course list stable by id.
          orderBy: { id: 'asc' },
          select: {
            courseId: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                school: {
                  select: {
                    id: true,
                    name: true,
                    short: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const enrolledCourseIds = user.enrollments.map((enrollment) => enrollment.courseId)

    const [starCount, recentSheets] = await Promise.all([
      prisma.starredSheet.count({
        where: { userId: user.id },
      }),
      prisma.studySheet.findMany({
        where: enrolledCourseIds.length > 0 ? { courseId: { in: enrolledCourseIds } } : undefined,
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, username: true } },
          course: {
            select: {
              id: true,
              code: true,
              name: true,
              school: { select: { id: true, name: true, short: true } },
            },
          },
        },
      }),
    ])

    res.json({
      hero: {
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        avatarUrl: user.avatarUrl || null,
        email: user.email || null,
        emailVerified: Boolean(user.emailVerified),
      },
      stats: {
        courseCount: user._count.enrollments,
        sheetCount: user._count.studySheets,
        starCount,
      },
      courses: user.enrollments.map((enrollment) => enrollment.course),
      recentSheets,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
