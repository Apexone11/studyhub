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
const log = require('../../lib/logger')
const { exportDataLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.get('/export', exportDataLimiter, async (req, res) => {
  const userId = req.user.userId

  // A GDPR Art. 20 / CCPA export must be honest about completeness. The two
  // naive options are both wrong: a silent `.catch(() => [])` presents a
  // partial dump as the user's full data, while a hard 500 on one failed
  // sub-query denies them the rest of it. `loadSection` splits the difference
  // — it logs the underlying error (pino + Sentry, so schema drift / query
  // regressions are observable), returns a fallback so the rest of the export
  // still ships, and records the section name so the response can flag itself
  // as partial.
  const incompleteSections = []
  const loadSection = async (name, run, fallback) => {
    try {
      return await run()
    } catch (err) {
      incompleteSections.push(name)
      log.error(
        { event: 'settings.export_section_failed', section: name, userId, err: err?.message },
        'GDPR export section failed to load',
      )
      captureError(err, { route: req.originalUrl, method: req.method, userId, section: name })
      return fallback
    }
  }

  try {
    // Fetch all user data in parallel for speed. Each section degrades
    // independently via loadSection (see above) instead of failing the export.
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
      aiAttachments,
      aiUsage,
      scholarAnnotations,
      scholarDiscussions,
    ] = await Promise.all([
      // Profile
      loadSection(
        'profile',
        () =>
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
              lastActiveAt: true,
            },
          }),
        null,
      ),

      // Study sheets authored
      loadSection(
        'sheets',
        () =>
          prisma.studySheet.findMany({
            where: { userId },
            select: {
              id: true,
              title: true,
              description: true,
              courseId: true,
              status: true,
              stars: true,
              forks: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }),
        [],
      ),

      // Notes
      loadSection(
        'notes',
        () =>
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
        [],
      ),

      // Feed posts
      loadSection(
        'feedPosts',
        () =>
          prisma.feedPost.findMany({
            where: { userId: userId },
            select: {
              id: true,
              content: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }),
        [],
      ),

      // Contribute-back proposals the user made (model: SheetContribution).
      loadSection(
        'contributions',
        () =>
          prisma.sheetContribution.findMany({
            where: { proposerId: userId },
            select: {
              id: true,
              targetSheetId: true,
              forkSheetId: true,
              status: true,
              message: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }),
        [],
      ),

      // Course enrollments (Enrollment has no timestamp column).
      loadSection(
        'enrollments',
        () =>
          prisma.enrollment.findMany({
            where: { userId: userId },
            select: {
              courseId: true,
              course: {
                select: { name: true, code: true },
              },
            },
          }),
        [],
      ),

      // Starred sheets (StarredSheet has no createdAt).
      loadSection(
        'starredSheets',
        () =>
          prisma.starredSheet.findMany({
            where: { userId: userId },
            select: {
              sheetId: true,
            },
          }),
        [],
      ),

      // Starred notes
      loadSection(
        'starredNotes',
        () =>
          prisma.noteStar.findMany({
            where: { userId: userId },
            select: {
              noteId: true,
              createdAt: true,
            },
          }),
        [],
      ),

      // Preferences (model: UserPreferences).
      loadSection(
        'preferences',
        () =>
          prisma.userPreferences.findUnique({
            where: { userId: userId },
            select: {
              theme: true,
              profileVisibility: true,
              emailDigest: true,
              inAppNotifications: true,
            },
          }),
        null,
      ),

      // Conversations (DM participation, no message content for privacy)
      loadSection(
        'conversations',
        () =>
          prisma.conversationParticipant.findMany({
            where: { userId: userId },
            select: {
              conversationId: true,
              joinedAt: true,
              lastReadAt: true,
            },
          }),
        [],
      ),

      // Study group memberships
      loadSection(
        'studyGroups',
        () =>
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
          }),
        [],
      ),

      // Hub AI v2 + Scholar — GDPR Art. 15 / Art. 20 portability.
      loadSection(
        'hubAiAttachments',
        () =>
          prisma.aiAttachment.findMany({
            where: { userId, deletedAt: null },
            select: {
              id: true,
              mimeType: true,
              fileName: true,
              bytes: true,
              pageCount: true,
              createdAt: true,
              expiresAt: true,
              pinnedUntil: true,
            },
          }),
        [],
      ),

      loadSection(
        'hubAiUsage',
        () =>
          prisma.aiUsageLog.findMany({
            where: { userId },
            select: {
              id: true,
              date: true,
              messageCount: true,
              documentCount: true,
              tokensIn: true,
              tokensOut: true,
              documentTokens: true,
              costUsdCents: true,
            },
          }),
        [],
      ),

      loadSection(
        'scholarAnnotations',
        () =>
          prisma.scholarAnnotation.findMany({
            where: { userId },
            select: {
              id: true,
              paperId: true,
              color: true,
              visibility: true,
              body: true,
              rangeJson: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        [],
      ),

      loadSection(
        'scholarDiscussions',
        () =>
          prisma.scholarDiscussionThread.findMany({
            where: { authorId: userId },
            select: {
              id: true,
              paperId: true,
              schoolId: true,
              body: true,
              createdAt: true,
              deletedAt: true,
            },
          }),
        [],
      ),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      format: 'StudyHub Data Export v1.0',
      // When non-empty, some sections could not be loaded — the export is a
      // best-effort partial. The named sections were logged server-side.
      partial: incompleteSections.length > 0,
      ...(incompleteSections.length > 0 ? { incompleteSections } : {}),
      user: profile,
      sheets,
      notes,
      feedPosts,
      contributions,
      enrollments: enrollments.map((e) => ({
        courseName: e.course?.name,
        courseCode: e.course?.code,
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
      hubAi: {
        attachments: aiAttachments,
        usageDaily: aiUsage,
      },
      scholar: {
        annotations: scholarAnnotations,
        discussions: scholarDiscussions,
      },
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
