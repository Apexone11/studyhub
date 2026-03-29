const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { validateHtmlForSubmission } = require('../../lib/html/htmlSecurity')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { updateFingerprint } = require('../../lib/plagiarismService')
const { createProvenanceToken } = require('../../lib/provenance')
const { isHtmlUploadsEnabled } = require('../../lib/html/htmlKillSwitch')
const { SHEET_STATUS, AUTHOR_SELECT, sheetWriteLimiter } = require('./sheets.constants')
const { trackActivity } = require('../../lib/activityTracker')
const { runAbuseChecks } = require('../../lib/abuseDetection')
const { checkAndAwardBadges } = require('../../lib/badges')
const {
  resolveNextSheetStatus,
  normalizeContentFormat,
  getUserDefaultDownloads,
} = require('./sheets.service')
const { serializeSheet } = require('./sheets.serializer')

const router = express.Router()

router.post('/', requireAuth, requireVerifiedEmail, sheetWriteLimiter, async (req, res) => {
  const { title, content, courseId, forkOf, description, allowDownloads } = req.body || {}
  const contentFormat = normalizeContentFormat(req.body?.contentFormat)
  const nextStatus = resolveNextSheetStatus({
    requestedStatus: req.body?.status,
    contentFormat,
    user: req.user,
  })

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' })
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' })
  if (!courseId) return res.status(400).json({ error: 'Course is required.' })

  try {
    if (contentFormat === 'html') {
      const killSwitch = await isHtmlUploadsEnabled()
      if (!killSwitch.enabled) {
        return res.status(403).json({
          error: 'HTML uploads are temporarily disabled. Please use Markdown instead.',
          code: 'HTML_UPLOADS_DISABLED',
        })
      }
      const validation = validateHtmlForSubmission(content)
      if (!validation.ok) {
        return res.status(400).json({ error: validation.issues[0], issues: validation.issues })
      }
    }

    /* Use user's defaultDownloads preference when not explicitly set in request */
    const resolvedAllowDownloads = typeof allowDownloads === 'boolean'
      ? allowDownloads
      : await getUserDefaultDownloads(req.user.userId)

    const sheet = await prisma.studySheet.create({
      data: {
        title: title.trim().slice(0, 160),
        description: description?.trim().slice(0, 300) || '',
        content: content.trim(),
        contentFormat,
        status: nextStatus,
        courseId: Number.parseInt(courseId, 10),
        userId: req.user.userId,
        forkOf: forkOf ? Number.parseInt(forkOf, 10) : null,
        allowDownloads: resolvedAllowDownloads,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        course: { include: { school: true } },
        htmlVersions: true,
      },
    })

    trackActivity(prisma, req.user.userId, 'sheets')
    checkAndAwardBadges(prisma, req.user.userId)

    res.status(201).json({
      ...serializeSheet(sheet),
      message: nextStatus === SHEET_STATUS.PENDING_REVIEW
        ? 'HTML sheet submitted for admin review.'
        : 'Sheet published.',
    })

    /* Async content moderation — scan title + description + markdown content */
    if (isModerationEnabled()) {
      const textToScan = `${title} ${description || ''} ${contentFormat === 'markdown' ? content : ''}`.trim()
      void scanContent({ contentType: 'sheet', contentId: sheet.id, text: textToScan, userId: req.user.userId })
    }

    /* Abuse detection — rate anomaly, duplicate, new-account checks (fire-and-forget) */
    void runAbuseChecks({
      userId: req.user.userId,
      actionType: 'sheet_create',
      contentType: 'sheet',
      contentId: sheet.id,
      text: `${title} ${description || ''} ${content || ''}`.slice(0, 1000),
    })

    /* Content fingerprinting for plagiarism detection (fire-and-forget) */
    void updateFingerprint('sheet', sheet.id, content)

    /* Auto-generate provenance manifest (fire-and-forget) */
    Promise.resolve().then(async () => {
      try {
        const token = createProvenanceToken(sheet.id, req.user.userId, content.trim(), sheet.createdAt)
        await prisma.provenanceManifest.upsert({
          where: { sheetId: sheet.id },
          update: {
            originHash: token.originHash,
            encryptedToken: token.encryptedToken,
            algorithm: token.algorithm,
            iv: token.iv,
            authTag: token.authTag,
          },
          create: {
            sheetId: sheet.id,
            originHash: token.originHash,
            encryptedToken: token.encryptedToken,
            algorithm: token.algorithm,
            iv: token.iv,
            authTag: token.authTag,
          },
        })
      } catch (err) {
        captureError(err, { context: 'provenance.autoGenerate', sheetId: sheet.id })
      }
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
