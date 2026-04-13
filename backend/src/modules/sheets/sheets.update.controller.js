const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const { cleanupAttachmentIfUnused } = require('../../lib/storage')
const { validateHtmlForSubmission } = require('../../lib/html/htmlSecurity')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { updateFingerprint } = require('../../lib/plagiarismService')
const { findSimilarSheets } = require('../../lib/plagiarism')
const { runPlagiarismScan } = require('../plagiarism/plagiarism.service')
const { createProvenanceToken } = require('../../lib/provenance')
const { isHtmlUploadsEnabled } = require('../../lib/html/htmlKillSwitch')
const { SHEET_STATUS, AUTHOR_SELECT, sheetWriteLimiter } = require('./sheets.constants')
const {
  normalizeSheetStatus,
  resolveNextSheetStatus,
  normalizeContentFormat,
} = require('./sheets.service')
const { serializeSheet } = require('./sheets.serializer')
const { createNotification } = require('../../lib/notify')
const log = require('../../lib/logger')

const router = express.Router()

router.patch('/:id', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const { title, description, content, courseId, allowDownloads, allowEditing, removeAttachment } =
    req.body || {}

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        userId: true,
        title: true,
        content: true,
        contentFormat: true,
        status: true,
        attachmentUrl: true,
        allowEditing: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    const isOwnerOrAdmin = req.user.role === 'admin' || req.user.userId === sheet.userId
    if (!isOwnerOrAdmin && !sheet.allowEditing) {
      return res.status(403).json({ error: 'The owner has disabled editing on this sheet.' })
    }
    if (!isOwnerOrAdmin) {
      // Non-owners with editing permission can only update content fields,
      // not metadata like allowDownloads, allowEditing, status, courseId, or removeAttachment.
      const restricted = [
        'allowDownloads',
        'allowEditing',
        'status',
        'courseId',
        'removeAttachment',
      ]
      const body = req.body || {}
      for (const key of restricted) {
        if (Object.hasOwn(body, key)) {
          return res.status(403).json({ error: 'Only the owner can change sheet settings.' })
        }
      }
    }

    const data = {}
    const requestedContentFormat =
      req.body && Object.hasOwn(req.body, 'contentFormat')
        ? normalizeContentFormat(req.body.contentFormat)
        : sheet.contentFormat
    const requestedStatus =
      req.body && Object.hasOwn(req.body, 'status') ? normalizeSheetStatus(req.body.status, '') : ''

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
    if (typeof allowEditing === 'boolean') {
      data.allowEditing = allowEditing
    }
    if (removeAttachment === true) {
      data.attachmentUrl = null
      data.attachmentType = null
      data.attachmentName = null
    }

    const nextContent = typeof data.content === 'string' ? data.content : null
    const nextFormat = data.contentFormat || sheet.contentFormat

    // Determine if moderation-relevant fields changed (content, format, attachment, status)
    const contentChanged =
      typeof content === 'string' ||
      (req.body && Object.hasOwn(req.body, 'contentFormat')) ||
      removeAttachment === true ||
      (req.body && Object.hasOwn(req.body, 'status'))

    if (contentChanged) {
      const wantsDraft = requestedStatus === SHEET_STATUS.DRAFT
      const nextStatus = wantsDraft
        ? SHEET_STATUS.DRAFT
        : resolveNextSheetStatus({
            requestedStatus,
            contentFormat: nextFormat,
            user: req.user,
            currentStatus: sheet.status,
          })

      if (nextFormat === 'html') {
        const killSwitch = await isHtmlUploadsEnabled()
        if (!killSwitch.enabled) {
          return res.status(403).json({
            error: 'HTML uploads are temporarily disabled. Please use Markdown instead.',
            code: 'HTML_UPLOADS_DISABLED',
          })
        }
        const htmlToValidate =
          typeof nextContent === 'string' ? nextContent : String(sheet.content || '')
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
        author: { select: AUTHOR_SELECT },
        course: { include: { school: true } },
        htmlVersions: true,
        forkSource: {
          select: {
            id: true,
            title: true,
            userId: true,
            author: { select: AUTHOR_SELECT },
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
      message:
        updated.status === SHEET_STATUS.PENDING_REVIEW
          ? 'Sheet submitted for admin review.'
          : updated.status === SHEET_STATUS.DRAFT
            ? 'Draft saved.'
            : 'Sheet updated.',
    })

    /* Notify fork owners when upstream metadata changes (title or status) — fire-and-forget */
    const titleChanged = typeof data.title === 'string' && data.title !== sheet.title
    const statusChanged = typeof data.status === 'string' && data.status !== sheet.status
    if (titleChanged || statusChanged) {
      Promise.resolve().then(async () => {
        try {
          const forks = await prisma.studySheet.findMany({
            where: { forkOf: sheetId },
            select: { userId: true },
          })
          const uniqueOwnerIds = [...new Set(forks.map((f) => f.userId))]
          const changeDesc = titleChanged
            ? `renamed to "${data.title}"`
            : `status changed to ${data.status}`
          await Promise.allSettled(
            uniqueOwnerIds.map((forkOwnerId) =>
              createNotification(prisma, {
                userId: forkOwnerId,
                type: 'upstream_change',
                message: `The original sheet you forked was ${changeDesc}.`,
                actorId: req.user.userId,
                sheetId,
                linkPath: `/sheets/${sheetId}`,
              }),
            ),
          )
        } catch (err) {
          captureError(err, { context: 'notify.upstreamChange', sheetId })
        }
      })
    }

    /* Async content moderation — scan updated title + description + markdown */
    if (isModerationEnabled()) {
      const textToScan = [
        data.title || '',
        data.description || '',
        nextFormat === 'markdown' && typeof content === 'string' ? content : '',
      ]
        .join(' ')
        .trim()
      if (textToScan) {
        void scanContent({
          contentType: 'sheet',
          contentId: sheetId,
          text: textToScan,
          userId: req.user.userId,
        })
      }
    }

    /* Content fingerprinting for plagiarism detection (fire-and-forget) */
    if (typeof content === 'string') void updateFingerprint('sheet', sheetId, content)

    /* Plagiarism check: find very similar sheets and create moderation case if needed (fire-and-forget) */
    if (typeof content === 'string') {
      Promise.resolve().then(async () => {
        try {
          // Wait a brief moment for fingerprint to be computed
          await new Promise((resolve) => setTimeout(resolve, 100))

          const similarSheets = await findSimilarSheets(sheetId, 5) // threshold=5 means ~92%+ similar
          if (similarSheets && similarSheets.length > 0) {
            const verySimilar = similarSheets.filter((s) => s.distance <= 5)
            if (verySimilar.length > 0) {
              log.info(
                { sheetId, matchCount: verySimilar.length, matches: verySimilar.slice(0, 3) },
                '[PLAGIARISM] very similar matches detected for sheet',
              )

              // Check if a plagiarism case already exists for this sheet
              const existingCase = await prisma.moderationCase.findFirst({
                where: {
                  contentType: 'sheet',
                  contentId: sheetId,
                  source: 'auto_plagiarism',
                  status: 'pending',
                },
                select: { id: true },
              })

              if (!existingCase) {
                // Create a moderation case for manual review
                try {
                  await prisma.moderationCase.create({
                    data: {
                      contentType: 'sheet',
                      contentId: sheetId,
                      userId: req.user.userId,
                      status: 'pending',
                      source: 'auto_plagiarism',
                      category: 'plagiarism',
                      reasonCategory: 'plagiarism',
                      confidence: 0.95, // High confidence for simhash similarity
                      excerpt: content.slice(0, 400),
                      evidence: {
                        similarSheets: verySimilar.map((s) => ({
                          sheetId: s.sheetId,
                          title: s.title,
                          author: s.username,
                          similarity: s.similarity,
                          distance: s.distance,
                        })),
                        detectionMethod: 'simhash_similarity',
                        threshold: 5,
                      },
                    },
                  })
                } catch (caseErr) {
                  captureError(caseErr, { context: 'plagiarism-case-create', sheetId })
                }
              }
            }
          }
        } catch (err) {
          captureError(err, { context: 'plagiarism-check', sheetId })
        }
      })
    }

    /* Phase 4: comprehensive plagiarism scan with multi-window SimHash + n-gram (fire-and-forget) */
    if (typeof content === 'string') void runPlagiarismScan(sheetId, content, req.user.userId)

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
            const token = createProvenanceToken(
              sheetId,
              req.user.userId,
              fullSheet.content,
              fullSheet.createdAt,
            )
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
