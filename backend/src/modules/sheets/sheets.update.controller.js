const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { cleanupAttachmentIfUnused } = require('../../lib/storage')
const { validateHtmlForSubmission } = require('../../lib/htmlSecurity')
const { isModerationEnabled, scanContent } = require('../../lib/moderationEngine')
const { createProvenanceToken } = require('../../lib/provenance')
const { isHtmlUploadsEnabled } = require('../../lib/htmlKillSwitch')
const { SHEET_STATUS, sheetWriteLimiter } = require('./sheets.constants')
const {
  normalizeSheetStatus,
  resolveNextSheetStatus,
  normalizeContentFormat,
} = require('./sheets.service')
const { serializeSheet } = require('./sheets.serializer')

const router = express.Router()

router.patch('/:id', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const { title, description, content, courseId, allowDownloads, removeAttachment } = req.body || {}

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        userId: true,
        content: true,
        contentFormat: true,
        status: true,
        attachmentUrl: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: sheet.userId,
      message: 'Not your sheet.',
      targetType: 'sheet',
      targetId: sheetId,
    })) return

    const data = {}
    const requestedContentFormat = req.body && Object.hasOwn(req.body, 'contentFormat')
      ? normalizeContentFormat(req.body.contentFormat)
      : sheet.contentFormat
    const requestedStatus = req.body && Object.hasOwn(req.body, 'status')
      ? normalizeSheetStatus(req.body.status, '')
      : ''

    if (typeof title === 'string') {
      if (!title.trim()) return res.status(400).json({ error: 'Title is required.' })
      data.title = title.trim().slice(0, 160)
    }
    if (typeof description === 'string') {
      data.description = description.trim().slice(0, 300)
    }
    if (typeof content === 'string') {
      if (!content.trim()) return res.status(400).json({ error: 'Content is required.' })
      data.content = content.trim()
    }
    if (requestedContentFormat) {
      data.contentFormat = requestedContentFormat
    }
    if (courseId) {
      data.courseId = Number.parseInt(courseId, 10)
    }
    if (typeof allowDownloads === 'boolean') {
      data.allowDownloads = allowDownloads
    }
    if (removeAttachment === true) {
      data.attachmentUrl = null
      data.attachmentType = null
      data.attachmentName = null
    }

    const nextContent = typeof data.content === 'string' ? data.content : null
    const nextFormat = data.contentFormat || sheet.contentFormat

    // Determine if moderation-relevant fields changed (content, format, attachment, status)
    const contentChanged = typeof content === 'string'
      || (req.body && Object.hasOwn(req.body, 'contentFormat'))
      || removeAttachment === true
      || (req.body && Object.hasOwn(req.body, 'status'))

    if (contentChanged) {
      const wantsDraft = requestedStatus === SHEET_STATUS.DRAFT
      const nextStatus = wantsDraft
        ? SHEET_STATUS.DRAFT
        : resolveNextSheetStatus({
            requestedStatus,
            contentFormat: nextFormat,
          })

      if (nextFormat === 'html') {
        const killSwitch = await isHtmlUploadsEnabled()
        if (!killSwitch.enabled) {
          return res.status(403).json({
            error: 'HTML uploads are temporarily disabled. Please use Markdown instead.',
            code: 'HTML_UPLOADS_DISABLED',
          })
        }
        const htmlToValidate = typeof nextContent === 'string' ? nextContent : String(sheet.content || '')
        if (nextStatus !== SHEET_STATUS.DRAFT || htmlToValidate.trim()) {
          const validation = validateHtmlForSubmission(htmlToValidate)
          if (!validation.ok) {
            return res.status(400).json({ error: validation.issues[0], issues: validation.issues })
          }
        }
      }

      data.status = nextStatus
    }
    // When only metadata changed (title, description, courseId, allowDownloads),
    // preserve the current status — do not re-run moderation pipeline.

    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data,
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        htmlVersions: true,
        forkSource: {
          select: {
            id: true,
            title: true,
            userId: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    if (removeAttachment === true) {
      await cleanupAttachmentIfUnused(prisma, sheet.attachmentUrl, {
        route: req.originalUrl,
        sheetId,
      })
    }

    res.json({
      ...serializeSheet(updated),
      message: updated.status === SHEET_STATUS.PENDING_REVIEW
        ? 'Sheet submitted for admin review.'
        : updated.status === SHEET_STATUS.DRAFT
          ? 'Draft saved.'
          : 'Sheet updated.',
    })

    /* Async content moderation — scan updated title + description + markdown */
    if (isModerationEnabled()) {
      const textToScan = [
        data.title || '',
        data.description || '',
        nextFormat === 'markdown' && typeof content === 'string' ? content : '',
      ].join(' ').trim()
      if (textToScan) {
        void scanContent({ contentType: 'sheet', contentId: sheetId, text: textToScan, userId: req.user.userId })
      }
    }

    /* Auto-generate provenance manifest if one does not exist yet (fire-and-forget) */
    Promise.resolve().then(async () => {
      try {
        const existing = await prisma.provenanceManifest.findUnique({
          where: { sheetId },
          select: { id: true },
        })
        if (!existing) {
          const fullSheet = await prisma.studySheet.findUnique({
            where: { id: sheetId },
            select: { content: true, createdAt: true },
          })
          if (fullSheet) {
            const token = createProvenanceToken(sheetId, req.user.userId, fullSheet.content, fullSheet.createdAt)
            await prisma.provenanceManifest.create({
              data: {
                sheetId,
                originHash: token.originHash,
                encryptedToken: token.encryptedToken,
                algorithm: token.algorithm,
                iv: token.iv,
                authTag: token.authTag,
              },
            })
          }
        }
      } catch (err) {
        captureError(err, { context: 'provenance.autoGenerate', sheetId })
      }
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
