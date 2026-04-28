const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { sendForbidden } = require('../../lib/accessControl')
const { validateHtmlForSubmission } = require('../../lib/html/htmlSecurity')
const {
  HTML_VERSION_KIND,
  importHtmlDraft,
  updateWorkingHtmlDraft,
  getHtmlScanStatus,
  acknowledgeHtmlScanWarning,
  upsertHtmlVersion,
} = require('../../lib/html/htmlDraftWorkflow')
const { isHtmlUploadsEnabled } = require('../../lib/html/htmlKillSwitch')
const { SHEET_STATUS, AUTHOR_SELECT, sheetWriteLimiter } = require('./sheets.constants')
const { normalizeContentFormat } = require('./sheets.service')
const { serializeSheet } = require('./sheets.serializer')

const router = express.Router()

router.get('/drafts/latest', requireAuth, async (req, res) => {
  try {
    const draft = await prisma.studySheet.findFirst({
      where: {
        userId: req.user.userId,
        status: SHEET_STATUS.DRAFT,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        course: { include: { school: true } },
        htmlVersions: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    res.json({ draft: draft ? serializeSheet(draft) : null })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// List all of the current user's in-progress drafts so the upload page
// can show a Gmail-style picker. Returns the lightweight summary shape
// (no HTML body) — clicking a draft loads the full record via
// /api/sheets/:id. Limited to 50 to keep the picker snappy; the schema
// already supports an arbitrary number of draft rows per user (each
// /drafts/autosave without an id creates a new row), this endpoint just
// surfaces them.
router.get('/drafts', requireAuth, async (req, res) => {
  try {
    const drafts = await prisma.studySheet.findMany({
      where: {
        userId: req.user.userId,
        status: SHEET_STATUS.DRAFT,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        contentFormat: true,
        updatedAt: true,
        createdAt: true,
        course: { select: { id: true, code: true, name: true } },
      },
    })

    res.json({
      drafts: drafts.map((draft) => ({
        id: draft.id,
        title: draft.title || 'Untitled draft',
        description: draft.description || '',
        contentFormat: draft.contentFormat,
        updatedAt: draft.updatedAt,
        createdAt: draft.createdAt,
        course: draft.course
          ? { id: draft.course.id, code: draft.course.code, name: draft.course.name }
          : null,
      })),
      total: drafts.length,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// Owner-only delete for in-progress drafts. The published-sheet delete
// endpoint already exists elsewhere; this one is scoped to status=draft
// so the picker can offer a "discard" action without ever touching a
// published sheet by accident.
router.delete('/drafts/:id', requireAuth, async (req, res) => {
  const draftId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(draftId)) {
    return res.status(400).json({ error: 'Draft id must be an integer.' })
  }

  try {
    const draft = await prisma.studySheet.findUnique({
      where: { id: draftId },
      select: { id: true, userId: true, status: true },
    })

    if (!draft) return res.status(404).json({ error: 'Draft not found.' })
    if (draft.userId !== req.user.userId && req.user.role !== 'admin') {
      return sendForbidden(res, 'Not your draft.')
    }
    if (draft.status !== SHEET_STATUS.DRAFT) {
      return res.status(409).json({ error: 'Only drafts can be discarded from this endpoint.' })
    }

    await prisma.studySheet.delete({ where: { id: draftId } })
    res.json({ message: 'Draft discarded.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post(
  '/drafts/autosave',
  requireAuth,
  requireVerifiedEmail,
  sheetWriteLimiter,
  async (req, res) => {
    const draftId = Number.parseInt(req.body?.id, 10)
    const parsedCourseId = Number.parseInt(req.body?.courseId, 10)
    const contentFormat = normalizeContentFormat(req.body?.contentFormat)

    if (!Number.isInteger(parsedCourseId) || parsedCourseId <= 0) {
      return res.status(400).json({ error: 'Course is required for autosave drafts.' })
    }

    const title =
      String(req.body?.title || '')
        .trim()
        .slice(0, 160) || 'Untitled draft'
    const content = String(req.body?.content || '')
    const description = String(req.body?.description || '')
      .trim()
      .slice(0, 300)
    const allowDownloads = req.body?.allowDownloads !== false

    try {
      if (contentFormat === 'html' && content.trim()) {
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

      let draft
      if (Number.isInteger(draftId)) {
        const existingDraft = await prisma.studySheet.findUnique({
          where: { id: draftId },
          select: { id: true, userId: true, status: true },
        })

        if (!existingDraft) return res.status(404).json({ error: 'Draft not found.' })
        if (existingDraft.userId !== req.user.userId && req.user.role !== 'admin') {
          return sendForbidden(res, 'Not your draft.')
        }

        draft = await prisma.studySheet.update({
          where: { id: draftId },
          data: {
            title,
            content,
            description,
            courseId: parsedCourseId,
            contentFormat,
            status: SHEET_STATUS.DRAFT,
            allowDownloads,
          },
          include: {
            author: { select: AUTHOR_SELECT },
            course: { include: { school: true } },
            htmlVersions: true,
          },
        })
      } else {
        draft = await prisma.studySheet.create({
          data: {
            title,
            content,
            description,
            courseId: parsedCourseId,
            userId: req.user.userId,
            contentFormat,
            status: SHEET_STATUS.DRAFT,
            allowDownloads,
          },
          include: {
            author: { select: AUTHOR_SELECT },
            course: { include: { school: true } },
            htmlVersions: true,
          },
        })
      }

      if (contentFormat === 'html' && content.trim()) {
        await upsertHtmlVersion(prisma, {
          sheetId: draft.id,
          userId: req.user.userId,
          kind: HTML_VERSION_KIND.WORKING,
          content,
          sourceName: 'working.html',
        })
        draft = await prisma.studySheet.findUnique({
          where: { id: draft.id },
          include: {
            author: { select: AUTHOR_SELECT },
            course: { include: { school: true } },
            htmlVersions: true,
          },
        })
      }

      res.json({
        message: 'Draft autosaved.',
        draft: serializeSheet(draft),
      })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Server error.' })
    }
  },
)

router.post(
  '/drafts/import-html',
  requireAuth,
  requireVerifiedEmail,
  sheetWriteLimiter,
  async (req, res) => {
    const draftId = Number.parseInt(req.body?.id, 10)
    const courseId = Number.parseInt(req.body?.courseId, 10)

    try {
      const nextDraftId = await importHtmlDraft(prisma, {
        sheetId: Number.isInteger(draftId) ? draftId : null,
        user: req.user,
        title: req.body?.title,
        courseId,
        description: req.body?.description,
        allowDownloads: req.body?.allowDownloads !== false,
        html: req.body?.html,
        sourceName:
          String(req.body?.sourceName || '')
            .trim()
            .slice(0, 120) || 'upload.html',
      })

      const draft = await prisma.studySheet.findUnique({
        where: { id: nextDraftId },
        include: {
          author: { select: AUTHOR_SELECT },
          course: { include: { school: true } },
          htmlVersions: true,
        },
      })

      const scan = await getHtmlScanStatus(prisma, { sheetId: nextDraftId, user: req.user })

      res.status(201).json({
        message: 'HTML file imported into draft workflow.',
        draft: serializeSheet(draft),
        scan,
      })
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
      if (statusCode >= 500) {
        captureError(error, { route: req.originalUrl, method: req.method })
      }
      res.status(statusCode).json({ error: error.message || 'Could not import HTML draft.' })
    }
  },
)

router.patch(
  '/drafts/:id/working-html',
  requireAuth,
  requireVerifiedEmail,
  sheetWriteLimiter,
  async (req, res) => {
    const sheetId = Number.parseInt(req.params.id, 10)

    if (!Number.isInteger(sheetId)) {
      return res.status(400).json({ error: 'Draft id must be an integer.' })
    }

    try {
      await updateWorkingHtmlDraft(prisma, {
        sheetId,
        user: req.user,
        title: req.body?.title,
        courseId: req.body?.courseId,
        description: req.body?.description,
        allowDownloads: req.body?.allowDownloads !== false,
        html: req.body?.html,
      })

      const draft = await prisma.studySheet.findUnique({
        where: { id: sheetId },
        include: {
          author: { select: AUTHOR_SELECT },
          course: { include: { school: true } },
          htmlVersions: true,
        },
      })
      const scan = await getHtmlScanStatus(prisma, { sheetId, user: req.user })

      res.json({
        message: 'Working HTML draft saved.',
        draft: serializeSheet(draft),
        scan,
      })
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
      if (statusCode >= 500) {
        captureError(error, { route: req.originalUrl, method: req.method })
      }
      res.status(statusCode).json({
        error: error.message || 'Could not save working HTML draft.',
        findings: error.findings || [],
      })
    }
  },
)

router.get('/drafts/:id/scan-status', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Draft id must be an integer.' })
  }

  try {
    const scan = await getHtmlScanStatus(prisma, { sheetId, user: req.user })
    res.json(scan)
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
    if (statusCode >= 500) {
      captureError(error, { route: req.originalUrl, method: req.method })
    }
    res.status(statusCode).json({ error: error.message || 'Could not fetch scan status.' })
  }
})

router.post('/drafts/:id/scan-status/acknowledge', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Draft id must be an integer.' })
  }

  try {
    await acknowledgeHtmlScanWarning(prisma, { sheetId, user: req.user })
    const scan = await getHtmlScanStatus(prisma, { sheetId, user: req.user })
    res.json({
      message: 'Scan warning acknowledged.',
      scan,
    })
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
    if (statusCode >= 500) {
      captureError(error, { route: req.originalUrl, method: req.method })
    }
    res.status(statusCode).json({ error: error.message || 'Could not acknowledge warning.' })
  }
})

module.exports = router
