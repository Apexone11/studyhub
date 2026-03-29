const express = require('express')
const { readLimiter } = require('../../lib/rateLimiters')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')

const router = express.Router()

router.use(requireAuth)
router.use(readLimiter)

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

    const [starCount, recentSheets, forkCount, feedPostCount] = await Promise.all([
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
      // Count sheets this user has forked (i.e., has a forkOf reference)
      prisma.studySheet.count({ where: { userId: user.id, forkOf: { not: null } } }),
      // Count feed posts made by this user
      prisma.feedPost.count({ where: { userId: user.id } }),
    ])

    // ── Activation checklist ──────────────────────────────────────────────
    // Guides new users through four key "aha moments" in product order.
    const hasCourse = user._count.enrollments > 0
    const hasStarred = starCount > 0
    const hasOwnSheet = user._count.studySheets > 0
    const hasForked = forkCount > 0
    const hasPosted = feedPostCount > 0
    const hasAvatar = Boolean(user.avatarUrl)
    const hasVerifiedEmail = Boolean(user.emailVerified)

    const activationChecklist = [
      {
        key: 'join_course',
        label: 'Join a course',
        helper: 'Personalise your feed and sheets.',
        done: hasCourse,
        actionLabel: 'Choose courses',
        actionPath: '/settings?tab=courses',
      },
      {
        key: 'verify_email',
        label: 'Verify your email',
        helper: 'Required to upload sheets and post comments.',
        done: hasVerifiedEmail,
        actionLabel: 'Verify now',
        actionPath: '/settings?tab=account',
      },
      {
        key: 'add_photo',
        label: 'Add a profile photo',
        helper: 'Help classmates recognise you.',
        done: hasAvatar,
        actionLabel: 'Add photo',
        actionPath: '/dashboard',
      },
      {
        key: 'star_or_view_sheet',
        label: 'Star a useful sheet',
        helper: 'Save sheets you want to revisit.',
        done: hasStarred,
        actionLabel: 'Browse sheets',
        actionPath: '/sheets',
      },
      {
        key: 'upload_or_fork_sheet',
        label: 'Upload or fork a study sheet',
        helper: 'Contribute to your course community.',
        done: hasOwnSheet || hasForked,
        actionLabel: hasOwnSheet ? 'See your sheets' : 'Upload a sheet',
        actionPath: hasOwnSheet ? '/sheets?mine=true' : '/sheets/upload',
      },
      {
        key: 'make_post',
        label: 'Post in the feed',
        helper: 'Introduce yourself or share a tip.',
        done: hasPosted,
        actionLabel: 'Open feed',
        actionPath: '/feed',
      },
    ]

    const completedCount = activationChecklist.filter((item) => item.done).length
    const nextItem = activationChecklist.find((item) => !item.done) || null

    // Mark as "new user" if account is less than 7 days old
    const accountAgeMs = Date.now() - new Date(user.createdAt).getTime()
    const isNewUser = accountAgeMs < 7 * 24 * 60 * 60 * 1000

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
      activation: {
        isNewUser,
        completedCount,
        totalCount: activationChecklist.length,
        checklist: activationChecklist,
        nextStep: nextItem,
      },
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
