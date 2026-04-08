/* ═══════════════════════════════════════════════════════════════════════════
 * settings.export.controller.js — User data export (GDPR/CCPA compliance)
 *
 * Allows users to download all their personal data in a single JSON file.
 * This is a legal requirement under GDPR (Article 20 - Right to Data
 * Portability) and CCPA. GitHub, Twitter, Instagram, and every major
 * platform provides this feature.
 *
 * GET /api/settings/export
 *   Returns a JSON file containing:
 *   - Profile information
 *   - Study sheets (metadata, not file content)
 *   - Notes
 *   - Feed posts
 *   - Comments / contributions
 *   - Bookmarked/starred content
 *   - Course enrollments
 *   - Messages (DM metadata, not group chats)
 *   - Study group memberships
 *   - Notification preferences
 *   - Account activity timestamps
 * ═══════════════════════════════════════════════════════════════════════════ */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { exportDataLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.get('/export', exportDataLimiter, async (req, res) => {
  const userId = req.user.userId

  try {
    // Fetch all user data in parallel for speed
    const [
      profile,
      sheets,
      notes,
      feedPosts,
      contributions,
      enrollments,
      stars,
      noteStars,
      preferences,
      conversations,
      studyGroupMemberships,
    ] = await Promise.all([
      // Profile
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          coverImageUrl: true,
          accountType: true,
          authProvider: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),

      // Study sheets authored
      prisma.studySheet.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          courseId: true,
          visibility: true,
          starCount: true,
          forkCount: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Notes
      prisma.note.findMany({
        where: { userId: userId },
        select: {
          id: true,
          title: true,
          content: true,
          pinned: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Feed posts
      prisma.feedPost.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          type: true,
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Contributions (comments, forks, etc.)
      prisma.contribution.findMany({
        where: { userId: userId },
        select: {
          id: true,
          type: true,
          sheetId: true,
          content: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Course enrollments
      prisma.enrollment.findMany({
        where: { userId: userId },
        select: {
          courseId: true,
          course: {
            select: { name: true, code: true },
          },
          enrolledAt: true,
        },
      }),

      // Starred sheets
      prisma.star.findMany({
        where: { userId: userId },
        select: {
          sheetId: true,
          createdAt: true,
        },
      }),

      // Starred notes
      prisma.noteStar.findMany({
        where: { userId: userId },
        select: {
          noteId: true,
          createdAt: true,
        },
      }).catch(() => []),

      // Preferences
      prisma.preferences.findUnique({
        where: { userId: userId },
        select: {
          theme: true,
          emailNotifications: true,
          pushNotifications: true,
          profileVisibility: true,
        },
      }).catch(() => null),

      // Conversations (DM participation, no message content for privacy)
      prisma.conversationParticipant.findMany({
        where: { userId: userId },
        select: {
          conversationId: true,
          joinedAt: true,
          lastReadAt: true,
        },
      }).catch(() => []),

      // Study group memberships
      prisma.studyGroupMember.findMany({
        where: { userId: userId },
        select: {
          groupId: true,
          role: true,
          joinedAt: true,
          group: {
            select: { name: true },
          },
        },
      }).catch(() => []),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      format: 'StudyHub Data Export v1.0',
      user: profile,
      sheets,
      notes,
      feedPosts,
      contributions,
      enrollments: enrollments.map((e) => ({
        courseName: e.course?.name,
        courseCode: e.course?.code,
        enrolledAt: e.enrolledAt,
      })),
      starredSheets: stars,
      starredNotes: noteStars,
      preferences,
      conversations,
      studyGroups: studyGroupMemberships.map((m) => ({
        groupName: m.group?.name,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    }

    // Set headers for file download
    const filename = `studyhub-export-${profile?.username || userId}-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    res.json(exportData)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method, userId })
    res.status(500).json({ error: 'Failed to export data. Please try again.' })
  }
})

module.exports = router
