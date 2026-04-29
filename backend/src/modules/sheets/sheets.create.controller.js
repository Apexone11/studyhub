const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { validateHtmlForSubmission, RISK_TIER } = require('../../lib/html/htmlSecurity')
const { scanHtmlContentForPersistence } = require('../../lib/html/htmlDraftValidation')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { updateFingerprint } = require('../../lib/plagiarismService')
const { findSimilarSheets } = require('../../lib/plagiarism')
const { runPlagiarismScan } = require('../plagiarism/plagiarism.service')
const { createProvenanceToken } = require('../../lib/provenance')
const { isHtmlUploadsEnabled } = require('../../lib/html/htmlKillSwitch')
const { SHEET_STATUS, AUTHOR_SELECT, sheetWriteLimiter } = require('./sheets.constants')
const { extractPreviewText } = require('../../lib/sheets/extractPreviewText')
const { getUserTier } = require('../../lib/getUserPlan')
const { PLANS } = require('../payments/payments.constants')
const { trackActivity } = require('../../lib/activityTracker')
const { runAbuseChecks } = require('../../lib/abuseDetection')
const { checkAndAwardBadges } = require('../../lib/badges')
const {
  resolveNextSheetStatus,
  normalizeContentFormat,
  getUserDefaultDownloads,
} = require('./sheets.service')
const { serializeSheet } = require('./sheets.serializer')
const log = require('../../lib/logger')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()

router.post('/', requireAuth, requireVerifiedEmail, sheetWriteLimiter, async (req, res) => {
  const { title, content, courseId, forkOf, description, allowDownloads } = req.body || {}
  const contentFormat = normalizeContentFormat(req.body?.contentFormat)
  const nextStatus = resolveNextSheetStatus({
    requestedStatus: req.body?.status,
    contentFormat,
    user: req.user,
  })

  if (!title?.trim()) return sendError(res, 400, 'Title is required.', ERROR_CODES.BAD_REQUEST)
  if (!content?.trim()) return sendError(res, 400, 'Content is required.', ERROR_CODES.BAD_REQUEST)
  if (!courseId) return sendError(res, 400, 'Course is required.', ERROR_CODES.BAD_REQUEST)

  try {
    /* Check upload quota based on user tier (free/donor/pro) */
    const tier = await getUserTier(req.user.userId)
    const tierConfig = PLANS[tier] || PLANS.free
    const limit = tierConfig.uploadsPerMonth
    if (limit !== -1) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      try {
        const monthlyCount = await prisma.studySheet.count({
          where: {
            userId: req.user.userId,
            createdAt: { gte: startOfMonth },
          },
        })

        if (monthlyCount >= limit) {
          return sendError(
            res,
            403,
            `Monthly upload limit reached (${limit}). Upgrade to Pro for unlimited uploads.`,
            'UPLOAD_LIMIT',
          )
        }
      } catch {
        // If quota check fails, gracefully degrade and allow the upload
      }
    }

    let htmlScanFields = null
    if (contentFormat === 'html') {
      const killSwitch = await isHtmlUploadsEnabled()
      if (!killSwitch.enabled) {
        return sendError(
          res,
          403,
          'HTML uploads are temporarily disabled. Please use Markdown instead.',
          'HTML_UPLOADS_DISABLED',
        )
      }
      const validation = validateHtmlForSubmission(content)
      if (!validation.ok) {
        return sendError(res, 400, validation.issues[0], ERROR_CODES.VALIDATION, {
          issues: validation.issues,
        })
      }
      htmlScanFields = await scanHtmlContentForPersistence(content)
    }

    /* Use user's defaultDownloads preference when not explicitly set in request */
    const resolvedAllowDownloads =
      typeof allowDownloads === 'boolean'
        ? allowDownloads
        : await getUserDefaultDownloads(req.user.userId)

    const trimmedContent = content.trim()
    const sheet = await prisma.studySheet.create({
      data: {
        title: title.trim().slice(0, 160),
        description: description?.trim().slice(0, 300) || '',
        previewText: extractPreviewText(trimmedContent),
        content: trimmedContent,
        contentFormat,
        status:
          htmlScanFields?.htmlRiskTier === RISK_TIER.QUARANTINED
            ? SHEET_STATUS.QUARANTINED
            : nextStatus,
        courseId: Number.parseInt(courseId, 10),
        userId: req.user.userId,
        forkOf: forkOf ? Number.parseInt(forkOf, 10) : null,
        allowDownloads: resolvedAllowDownloads,
        ...(htmlScanFields || {}),
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
      message:
        sheet.status === SHEET_STATUS.PENDING_REVIEW
          ? 'HTML sheet submitted for admin review.'
          : sheet.status === SHEET_STATUS.QUARANTINED
            ? 'HTML sheet quarantined for security review.'
            : 'Sheet published.',
    })

    /* Async content moderation — scan title + description + markdown content */
    if (isModerationEnabled()) {
      const textToScan =
        `${title} ${description || ''} ${contentFormat === 'markdown' ? content : ''}`.trim()
      void scanContent({
        contentType: 'sheet',
        contentId: sheet.id,
        text: textToScan,
        userId: req.user.userId,
      })
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

    /* Plagiarism check: find very similar sheets and create moderation case if needed (fire-and-forget) */
    Promise.resolve().then(async () => {
      try {
        // Wait a brief moment for fingerprint to be computed
        await new Promise((resolve) => setTimeout(resolve, 100))

        const similarSheets = await findSimilarSheets(sheet.id, 5) // threshold=5 means ~92%+ similar
        if (similarSheets && similarSheets.length > 0) {
          const verySimialar = similarSheets.filter((s) => s.distance <= 5)
          if (verySimialar.length > 0) {
            log.info(
              {
                sheetId: sheet.id,
                matchCount: verySimialar.length,
                matches: verySimialar.slice(0, 3),
              },
              '[PLAGIARISM] very similar matches detected for sheet',
            )

            // Create a moderation case for manual review
            try {
              await prisma.moderationCase.create({
                data: {
                  contentType: 'sheet',
                  contentId: sheet.id,
                  userId: req.user.userId,
                  status: 'pending',
                  source: 'auto_plagiarism',
                  category: 'plagiarism',
                  reasonCategory: 'plagiarism',
                  confidence: 0.95, // High confidence for simhash similarity
                  excerpt: content.slice(0, 400),
                  evidence: {
                    similarSheets: verySimialar.map((s) => ({
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
              captureError(caseErr, { context: 'plagiarism-case-create', sheetId: sheet.id })
            }
          }
        }
      } catch (err) {
        captureError(err, { context: 'plagiarism-check', sheetId: sheet.id })
      }
    })

    /* Phase 4: comprehensive plagiarism scan with multi-window SimHash + n-gram (fire-and-forget) */
    void runPlagiarismScan(sheet.id, content, req.user.userId)

    /* Auto-generate provenance manifest (fire-and-forget) */
    Promise.resolve().then(async () => {
      try {
        const token = createProvenanceToken(
          sheet.id,
          req.user.userId,
          content.trim(),
          sheet.createdAt,
        )
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
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
