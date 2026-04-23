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
        accountType: true,
        isStaffVerified: true,
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

    const [starCount, recentSheets, forkCount, feedPostCount, noteCount, groupMembershipCount] =
      await Promise.all([
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
        prisma.studySheet.count({ where: { userId: user.id, NOT: [{ forkOf: null }] } }),
        // Count feed posts made by this user
        prisma.feedPost.count({ where: { userId: user.id } }),
        // Notes authored by this user — used by the self-learner checklist
        prisma.note.count({ where: { userId: user.id } }),
        // Active study-group memberships — used by the self-learner checklist
        prisma.studyGroupMember.count({ where: { userId: user.id, status: 'active' } }),
      ])

    // ── Activation checklist ──────────────────────────────────────────────
    // Role-aware onboarding: student, teacher, and self-learner each see a
    // tailored set of next steps. Source of truth for the UX is
    // frontend/studyhub-app/src/features/onboarding/checklistConfig.js; the
    // backend re-implements the same items here so completion state can be
    // evaluated against data we already fetched above (no extra round-trips).
    const hasCourse = user._count.enrollments > 0
    const hasStarred = starCount > 0
    const hasOwnSheet = user._count.studySheets > 0
    const hasForked = forkCount > 0
    const hasPosted = feedPostCount > 0
    const hasAvatar = Boolean(user.avatarUrl)
    const hasVerifiedEmail = Boolean(user.emailVerified)
    const hasNote = noteCount > 0
    const hasGroup = groupMembershipCount > 0
    const isTeacherVerified = Boolean(user.isStaffVerified)

    const studentChecklist = [
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
        actionPath: '/settings?tab=profile',
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

    const teacherChecklist = [
      {
        key: 'verify_email',
        label: 'Verify your email',
        helper: 'Required to publish and invite students.',
        done: hasVerifiedEmail,
        actionLabel: 'Verify now',
        actionPath: '/settings?tab=account',
      },
      {
        key: 'verify_teaching',
        label: 'Verify your teaching status',
        helper: 'Unlocks the teacher workspace and badges.',
        done: isTeacherVerified,
        actionLabel: 'Start verification',
        actionPath: '/settings?tab=account',
      },
      {
        key: 'add_photo',
        label: 'Add a profile photo',
        helper: 'Help your students recognise you.',
        done: hasAvatar,
        actionLabel: 'Add photo',
        actionPath: '/settings?tab=profile',
      },
      {
        key: 'publish_first_material',
        label: 'Publish your first material',
        helper: 'Upload a sheet your students can reference.',
        done: hasOwnSheet,
        actionLabel: hasOwnSheet ? 'See your sheets' : 'Publish a sheet',
        actionPath: hasOwnSheet ? '/sheets?mine=true' : '/sheets/upload',
      },
      {
        key: 'connect_a_course',
        label: 'Connect a course you teach',
        helper: 'So materials attach to the right class.',
        done: hasCourse,
        actionLabel: 'Connect course',
        actionPath: '/settings?tab=courses',
      },
      {
        key: 'make_post',
        label: 'Share an announcement with your class',
        helper: 'Drop a tip, a deadline, or a problem of the week.',
        done: hasPosted,
        actionLabel: 'Open feed',
        actionPath: '/feed',
      },
    ]

    const selfLearnerChecklist = [
      {
        key: 'verify_email',
        label: 'Verify your email',
        helper: 'Keeps your account recoverable.',
        done: hasVerifiedEmail,
        actionLabel: 'Verify now',
        actionPath: '/settings?tab=account',
      },
      {
        key: 'add_photo',
        label: 'Add a profile photo',
        helper: 'Make your learning profile your own.',
        done: hasAvatar,
        actionLabel: 'Add photo',
        actionPath: '/settings?tab=profile',
      },
      {
        key: 'star_topic_sheet',
        label: 'Star a sheet that looks useful',
        helper: 'Build your personal reference library.',
        done: hasStarred,
        actionLabel: 'Browse sheets',
        actionPath: '/sheets',
      },
      {
        key: 'write_reflection',
        label: 'Write your first reflection note',
        helper: 'Notes stay private until you share them.',
        done: hasNote,
        actionLabel: hasNote ? 'See your notes' : 'Write a note',
        actionPath: '/notes',
      },
      {
        key: 'join_study_group',
        label: 'Join a study group',
        helper: 'Learn alongside people with the same goal.',
        done: hasGroup,
        actionLabel: hasGroup ? 'Open study groups' : 'Find a group',
        actionPath: '/study-groups',
      },
      {
        key: 'make_post',
        label: 'Share what you are learning',
        helper: 'Post a question or a win in the feed.',
        done: hasPosted,
        actionLabel: 'Open feed',
        actionPath: '/feed',
      },
    ]

    function checklistForAccountType(accountType) {
      switch (accountType) {
        case 'teacher':
          return teacherChecklist
        case 'other':
          return selfLearnerChecklist
        case 'student':
        default:
          return studentChecklist
      }
    }

    const activationChecklist = checklistForAccountType(user.accountType)

    const completedCount = activationChecklist.filter((item) => item.done).length
    const nextItem = activationChecklist.find((item) => !item.done) || null

    // Mark as "new user" if account is less than 7 days old
    const accountAgeMs = Date.now() - new Date(user.createdAt).getTime()
    const isNewUser = accountAgeMs < 7 * 24 * 60 * 60 * 1000

    return res.json({
      hero: {
        username: user.username,
        role: user.role,
        accountType: user.accountType || 'student',
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
