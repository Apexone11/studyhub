const express = require('express')
const rateLimit = require('express-rate-limit')
const fs = require('node:fs')
const path = require('node:path')
const { assertOwnerOrAdmin, sendForbidden } = require('../lib/accessControl')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { createNotification } = require('../lib/notify')
const { notifyMentionedUsers } = require('../lib/mentions')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const prisma = require('../lib/prisma')
const { cleanupAttachmentIfUnused, resolveAttachmentPath } = require('../lib/storage')
const { sendAttachmentPreview } = require('../lib/attachmentPreview')
const { normalizeContentFormat, validateHtmlForSubmission } = require('../lib/htmlSecurity')
const { HTML_PREVIEW_TOKEN_TTL_SECONDS, signHtmlPreviewToken } = require('../lib/previewTokens')
const { buildSheetTextSearchClauses } = require('../lib/sheetSearch')
const { computeLineDiff, addWordSegments } = require('../lib/diff')
const { searchSheetsFTS } = require('../lib/fullTextSearch')
const {
  SCAN_STATUS,
  HTML_VERSION_KIND,
  importHtmlDraft,
  updateWorkingHtmlDraft,
  getHtmlScanStatus,
  acknowledgeHtmlScanWarning,
  submitHtmlDraftForReview,
  upsertHtmlVersion,
} = require('../lib/htmlDraftWorkflow')
const { isModerationEnabled, scanContent } = require('../lib/moderationEngine')
const { createProvenanceToken } = require('../lib/provenance')
const { isHtmlUploadsEnabled } = require('../lib/htmlKillSwitch')
const requireVerifiedEmail = require('../middleware/requireVerifiedEmail')

const router = express.Router()
const SHEET_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
}

const reactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const sheetWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many sheet updates. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many comments. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const contributionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many contribution requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const contributionReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many contribution reviews. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const attachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many attachment downloads. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

function optionalAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid token — proceed as unauthenticated.
  }
  next()
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeSheetStatus(value, fallback = SHEET_STATUS.PUBLISHED) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === SHEET_STATUS.DRAFT) return SHEET_STATUS.DRAFT
  if (normalized === SHEET_STATUS.PENDING_REVIEW) return SHEET_STATUS.PENDING_REVIEW
  if (normalized === SHEET_STATUS.PUBLISHED) return SHEET_STATUS.PUBLISHED
  if (normalized === SHEET_STATUS.REJECTED) return SHEET_STATUS.REJECTED
  return fallback
}

function canModerateOrOwnSheet(sheet, user) {
  return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
}

function canReadSheet(sheet, user) {
  if (sheet.status === SHEET_STATUS.PUBLISHED) return true
  return canModerateOrOwnSheet(sheet, user)
}

function resolveNextSheetStatus({ requestedStatus, contentFormat, isDraftAutosave = false }) {
  const normalizedRequested = normalizeSheetStatus(requestedStatus, '')
  if (normalizedRequested === SHEET_STATUS.DRAFT || isDraftAutosave) {
    return SHEET_STATUS.DRAFT
  }
  if (contentFormat === 'html') {
    return SHEET_STATUS.PENDING_REVIEW
  }
  return SHEET_STATUS.PUBLISHED
}

function safeDownloadName(name, fallbackExt = '') {
  const ext = fallbackExt || path.extname(name || '')
  const base = String(name || 'studyhub-sheet')
    .replace(path.extname(String(name || '')), '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'studyhub-sheet'

  return `${base}${ext}`.toLowerCase()
}

function resolvePreviewOrigin(req) {
  const configuredOrigin = String(process.env.HTML_PREVIEW_ORIGIN || '').trim()

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin
    } catch {
      // Fall back to the current request origin when misconfigured.
    }
  }

  return `${req.protocol}://${req.get('host')}`
}

function serializeContribution(contribution) {
  if (!contribution) return null

  return {
    id: contribution.id,
    status: contribution.status,
    message: contribution.message,
    createdAt: contribution.createdAt,
    updatedAt: contribution.updatedAt,
    reviewedAt: contribution.reviewedAt,
    proposer: contribution.proposer
      ? {
          id: contribution.proposer.id,
          username: contribution.proposer.username,
        }
      : null,
    reviewer: contribution.reviewer
      ? {
          id: contribution.reviewer.id,
          username: contribution.reviewer.username,
        }
      : null,
    forkSheet: contribution.forkSheet
      ? {
          id: contribution.forkSheet.id,
          title: contribution.forkSheet.title,
          updatedAt: contribution.forkSheet.updatedAt,
          author: contribution.forkSheet.author
            ? {
                id: contribution.forkSheet.author.id,
                username: contribution.forkSheet.author.username,
              }
            : null,
        }
      : null,
    targetSheetId: contribution.targetSheetId,
    forkSheetId: contribution.forkSheetId,
  }
}

function serializeSheet(sheet, { starred = false, reactions = null, commentCount = 0 } = {}) {
  const originalVersion = Array.isArray(sheet.htmlVersions)
    ? sheet.htmlVersions.find((entry) => entry.kind === HTML_VERSION_KIND.ORIGINAL)
    : null
  const workingVersion = Array.isArray(sheet.htmlVersions)
    ? sheet.htmlVersions.find((entry) => entry.kind === HTML_VERSION_KIND.WORKING)
    : null

  const response = {
    ...sheet,
    starred,
    allowDownloads: sheet.allowDownloads !== false,
    hasAttachment: Boolean(sheet.attachmentUrl),
    attachmentName: sheet.attachmentName || null,
    attachmentUrl: null,
    commentCount,
    htmlWorkflow: {
      scanStatus: sheet.htmlScanStatus || SCAN_STATUS.QUEUED,
      scanFindings: Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : [],
      scanUpdatedAt: sheet.htmlScanUpdatedAt || null,
      scanAcknowledgedAt: sheet.htmlScanAcknowledgedAt || null,
      hasOriginalVersion: Boolean(originalVersion),
      hasWorkingVersion: Boolean(workingVersion),
      originalSourceName: originalVersion?.sourceName || null,
    },
  }

  if (reactions) {
    response.reactions = reactions
  }

  if (sheet.forkSource) {
    response.forkSource = {
      id: sheet.forkSource.id,
      title: sheet.forkSource.title,
      userId: sheet.forkSource.userId,
      author: sheet.forkSource.author
        ? {
            id: sheet.forkSource.author.id,
            username: sheet.forkSource.author.username,
          }
        : null,
    }
  }

  return response
}

async function fetchContributionCollections(sheet, currentUser) {
  const canReviewIncoming = currentUser && (currentUser.role === 'admin' || currentUser.userId === sheet.userId)
  const canSeeOutgoing = currentUser && (currentUser.role === 'admin' || currentUser.userId === sheet.userId)

  const [incomingContributions, outgoingContributions] = await Promise.all([
    canReviewIncoming
      ? prisma.sheetContribution.findMany({
          where: { targetSheetId: sheet.id },
          include: {
            proposer: { select: { id: true, username: true } },
            reviewer: { select: { id: true, username: true } },
            forkSheet: {
              select: {
                id: true,
                title: true,
                updatedAt: true,
                author: { select: { id: true, username: true } },
              },
            },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 20,
        })
      : [],
    canSeeOutgoing
      ? prisma.sheetContribution.findMany({
          where: { forkSheetId: sheet.id },
          include: {
            proposer: { select: { id: true, username: true } },
            reviewer: { select: { id: true, username: true } },
            forkSheet: {
              select: {
                id: true,
                title: true,
                updatedAt: true,
                author: { select: { id: true, username: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
  ])

  return {
    incomingContributions: incomingContributions.map(serializeContribution),
    outgoingContributions: outgoingContributions.map(serializeContribution),
  }
}

router.get('/leaderboard', leaderboardLimiter, async (req, res) => {
  const type = req.query.type || 'stars'
  try {
    if (type === 'contributors') {
      const contributors = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          _count: { select: { studySheets: true } },
        },
        where: {
          studySheets: {
            some: { status: SHEET_STATUS.PUBLISHED },
          },
        },
        orderBy: { studySheets: { _count: 'desc' } },
        take: 5,
      })

      return res.json(contributors.map((user) => ({
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        count: user._count.studySheets,
      })))
    }

    const orderField = type === 'downloads' ? 'downloads' : 'stars'
    const sheets = await prisma.studySheet.findMany({
      select: {
        id: true,
        title: true,
        stars: true,
        downloads: true,
        allowDownloads: true,
        author: { select: { id: true, username: true } },
        course: { select: { code: true } },
      },
      where: { status: SHEET_STATUS.PUBLISHED },
      orderBy: { [orderField]: 'desc' },
      take: 5,
    })

    res.json(sheets)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/contributions/:contributionId', contributionReviewLimiter, requireAuth, async (req, res) => {
  const contributionId = Number.parseInt(req.params.contributionId, 10)
  const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : ''

  if (!Number.isInteger(contributionId)) {
    return res.status(400).json({ error: 'Contribution id must be an integer.' })
  }
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "accept" or "reject".' })
  }

  try {
    const contribution = await prisma.sheetContribution.findUnique({
      where: { id: contributionId },
      include: {
        targetSheet: {
          select: { id: true, userId: true, title: true, attachmentUrl: true },
        },
        forkSheet: {
          select: {
            id: true,
            title: true,
            description: true,
            content: true,
            contentFormat: true,
            attachmentUrl: true,
            attachmentType: true,
            attachmentName: true,
            allowDownloads: true,
          },
        },
        proposer: { select: { id: true, username: true } },
      },
    })

    if (!contribution) {
      return res.status(404).json({ error: 'Contribution not found.' })
    }
    if (contribution.status !== 'pending') {
      return res.status(409).json({ error: 'This contribution has already been reviewed.' })
    }
    if (req.user.role !== 'admin' && req.user.userId !== contribution.targetSheet.userId) {
      return sendForbidden(res, 'Only the original author can review this contribution.')
    }

    if (action === 'accept') {
      if (contribution.forkSheet.contentFormat === 'html') {
        const validation = validateHtmlForSubmission(contribution.forkSheet.content)
        if (!validation.ok) {
          return res.status(400).json({ error: validation.issues[0], issues: validation.issues })
        }
      }

      await prisma.studySheet.update({
        where: { id: contribution.targetSheetId },
        data: {
          description: contribution.forkSheet.description,
          content: contribution.forkSheet.content,
          contentFormat: contribution.forkSheet.contentFormat || 'markdown',
          status: SHEET_STATUS.PUBLISHED,
          attachmentUrl: contribution.forkSheet.attachmentUrl,
          attachmentType: contribution.forkSheet.attachmentType,
          attachmentName: contribution.forkSheet.attachmentName,
          allowDownloads: contribution.forkSheet.allowDownloads,
        },
      })

      if (contribution.targetSheet.attachmentUrl !== contribution.forkSheet.attachmentUrl) {
        await cleanupAttachmentIfUnused(prisma, contribution.targetSheet.attachmentUrl, {
          route: req.originalUrl,
          contributionId,
          targetSheetId: contribution.targetSheetId,
        })
      }
    }

    const updatedContribution = await prisma.sheetContribution.update({
      where: { id: contribution.id },
      data: {
        status: action === 'accept' ? 'accepted' : 'rejected',
        reviewerId: req.user.userId,
        reviewedAt: new Date(),
      },
      include: {
        proposer: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
        forkSheet: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    await createNotification(prisma, {
      userId: contribution.proposer.id,
      type: 'contribution',
      message: action === 'accept'
        ? `${req.user.username} accepted your contribution to "${contribution.targetSheet.title}".`
        : `${req.user.username} requested changes on your contribution to "${contribution.targetSheet.title}".`,
      actorId: req.user.userId,
      sheetId: contribution.targetSheet.id,
      linkPath: `/sheets/${contribution.targetSheet.id}`,
    })

    res.json({
      message: action === 'accept' ? 'Contribution accepted.' : 'Contribution rejected.',
      contribution: serializeContribution(updatedContribution),
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/', optionalAuth, async (req, res) => {
  const {
    courseId,
    schoolId,
    search,
    format,
    mine,
    starred,
    limit = 20,
    offset = 0,
    orderBy: orderByParam = 'createdAt',
    sort,
  } = req.query

  try {
    const where = {}
    const includeUnpublishedMine = mine === '1'

    if (includeUnpublishedMine) {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })
      where.userId = req.user.userId
    } else {
      where.status = SHEET_STATUS.PUBLISHED
    }

    if (courseId) where.courseId = Number.parseInt(courseId, 10)
    if (schoolId) where.course = { schoolId: Number.parseInt(schoolId, 10) }

    const formatCandidate = typeof format === 'string' ? format.trim().toLowerCase() : ''
    if (formatCandidate === 'html') {
      where.contentFormat = 'html'
    } else if (formatCandidate === 'pdf') {
      where.attachmentType = { contains: 'pdf', mode: 'insensitive' }
    } else if (formatCandidate === 'markdown') {
      where.contentFormat = 'markdown'
      where.NOT = { attachmentType: { contains: 'pdf', mode: 'insensitive' } }
    }

    const sheetTextSearchClauses = buildSheetTextSearchClauses(search)
    if (sheetTextSearchClauses.length) {
      where.OR = sheetTextSearchClauses
    }

    const allowedSort = ['createdAt', 'stars', 'downloads', 'forks', 'updatedAt']
    const sortCandidate = typeof sort === 'string' && sort.trim() ? sort : orderByParam
    const sortField = allowedSort.includes(sortCandidate) ? sortCandidate : 'createdAt'
    const take = parsePositiveInt(limit, 20)
    const skip = Math.max(0, Number.parseInt(offset, 10) || 0)

    if (starred === '1') {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })

      const starredRows = await prisma.starredSheet.findMany({
        where: { userId: req.user.userId, sheet: where },
        select: { sheetId: true },
        take,
        skip,
      })
      const starredSheetIds = starredRows.map((row) => row.sheetId)
      const totalStarred = await prisma.starredSheet.count({ where: { userId: req.user.userId, sheet: where } })

      const sheets = await prisma.studySheet.findMany({
        where: { id: { in: starredSheetIds } },
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
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

      const comments = await prisma.comment.groupBy({
        by: ['sheetId'],
        where: { sheetId: { in: starredSheetIds } },
        _count: { _all: true },
      })
      const commentCountBySheetId = new Map(comments.map((row) => [row.sheetId, row._count._all]))

      const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]))
      const ordered = starredSheetIds
        .map((sheetId) => sheetById.get(sheetId))
        .filter(Boolean)
        .map((sheet) => serializeSheet(sheet, {
          starred: true,
          commentCount: commentCountBySheetId.get(sheet.id) || 0,
        }))

      return res.json({ sheets: ordered, total: totalStarred, limit: take, offset: skip })
    }

    /* ── Full-text search path (opt-in via ?fts=true) ──────────────── */
    const useFTS = req.query.fts === 'true'
    if (useFTS && search && String(search).trim().length >= 2) {
      const ftsPage = Math.max(1, Math.floor(skip / take) + 1)
      const ftsResult = await searchSheetsFTS(search, {
        courseId: courseId ? Number.parseInt(courseId, 10) : undefined,
        userId: includeUnpublishedMine ? req.user.userId : undefined,
        status: includeUnpublishedMine ? undefined : SHEET_STATUS.PUBLISHED,
        page: ftsPage,
        limit: take,
      })

      const ftsSheetIds = ftsResult.sheets.map((s) => s.id)

      /* Hydrate with full Prisma relations for consistent serialization */
      const hydratedSheets = ftsSheetIds.length > 0
        ? await prisma.studySheet.findMany({
            where: { id: { in: ftsSheetIds } },
            include: {
              author: { select: { id: true, username: true } },
              course: { include: { school: true } },
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
        : []

      /* Preserve rank ordering from the FTS query */
      const hydratedById = new Map(hydratedSheets.map((s) => [s.id, s]))
      const orderedSheets = ftsSheetIds.map((id) => hydratedById.get(id)).filter(Boolean)

      const [ftsStarredRows, ftsCommentRows] = await Promise.all([
        req.user && ftsSheetIds.length > 0
          ? prisma.starredSheet.findMany({
              where: { userId: req.user.userId, sheetId: { in: ftsSheetIds } },
              select: { sheetId: true },
            })
          : [],
        ftsSheetIds.length > 0
          ? prisma.comment.groupBy({
              by: ['sheetId'],
              where: { sheetId: { in: ftsSheetIds } },
              _count: { _all: true },
            })
          : [],
      ])

      const ftsStarredIds = new Set(ftsStarredRows.map((r) => r.sheetId))
      const ftsCommentMap = new Map(ftsCommentRows.map((r) => [r.sheetId, r._count._all]))

      return res.json({
        sheets: orderedSheets.map((sheet) => serializeSheet(sheet, {
          starred: ftsStarredIds.has(sheet.id),
          commentCount: ftsCommentMap.get(sheet.id) || 0,
        })),
        total: ftsResult.total,
        limit: take,
        offset: skip,
        fts: true,
      })
    }

    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
          forkSource: {
            select: {
              id: true,
              title: true,
              userId: true,
              author: { select: { id: true, username: true } },
            },
          },
        },
        orderBy: { [sortField]: 'desc' },
        take,
        skip,
      }),
      prisma.studySheet.count({ where }),
    ])

    const sheetIds = sheets.map((sheet) => sheet.id)
    const [starredRows, commentRows] = await Promise.all([
      req.user
        ? prisma.starredSheet.findMany({
            where: { userId: req.user.userId, sheetId: { in: sheetIds } },
            select: { sheetId: true },
          })
        : [],
      sheetIds.length > 0
        ? prisma.comment.groupBy({
            by: ['sheetId'],
            where: { sheetId: { in: sheetIds } },
            _count: { _all: true },
          })
        : [],
    ])

    const starredIds = new Set(starredRows.map((row) => row.sheetId))
    const commentCountBySheetId = new Map(commentRows.map((row) => [row.sheetId, row._count._all]))

    res.json({
      sheets: sheets.map((sheet) => serializeSheet(sheet, {
        starred: starredIds.has(sheet.id),
        commentCount: commentCountBySheetId.get(sheet.id) || 0,
      })),
      total,
      limit: take,
      offset: skip,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/drafts/latest', requireAuth, async (req, res) => {
  try {
    const draft = await prisma.studySheet.findFirst({
      where: {
        userId: req.user.userId,
        status: SHEET_STATUS.DRAFT,
      },
      include: {
        author: { select: { id: true, username: true } },
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

router.post('/drafts/autosave', requireAuth, sheetWriteLimiter, async (req, res) => {
  const draftId = Number.parseInt(req.body?.id, 10)
  const parsedCourseId = Number.parseInt(req.body?.courseId, 10)
  const contentFormat = normalizeContentFormat(req.body?.contentFormat)

  if (!Number.isInteger(parsedCourseId) || parsedCourseId <= 0) {
    return res.status(400).json({ error: 'Course is required for autosave drafts.' })
  }

  const title = String(req.body?.title || '').trim().slice(0, 160) || 'Untitled draft'
  const content = String(req.body?.content || '')
  const description = String(req.body?.description || '').trim().slice(0, 300)
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
          author: { select: { id: true, username: true } },
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
          author: { select: { id: true, username: true } },
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
          author: { select: { id: true, username: true } },
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
})

router.post('/drafts/import-html', requireAuth, sheetWriteLimiter, async (req, res) => {
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
      sourceName: String(req.body?.sourceName || '').trim().slice(0, 120) || 'upload.html',
    })

    const draft = await prisma.studySheet.findUnique({
      where: { id: nextDraftId },
      include: {
        author: { select: { id: true, username: true } },
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
})

router.patch('/drafts/:id/working-html', requireAuth, sheetWriteLimiter, async (req, res) => {
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
        author: { select: { id: true, username: true } },
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
})

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

router.post('/:id/submit-review', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const sheet = await submitHtmlDraftForReview(prisma, { sheetId, user: req.user })
    res.json({
      ...serializeSheet(sheet),
      message: 'HTML sheet submitted for admin review.',
    })
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
    if (statusCode >= 500) {
      captureError(error, { route: req.originalUrl, method: req.method })
    }
    res.status(statusCode).json({
      error: error.message || 'Could not submit for review.',
      findings: error.findings || [],
    })
  }
})

router.get('/:id/html-preview', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        content: true,
        contentFormat: true,
        status: true,
        updatedAt: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.contentFormat !== 'html') {
      return res.status(400).json({ error: 'This sheet is not in HTML mode.' })
    }

    const validation = validateHtmlForSubmission(sheet.content)

    // We still return a previewUrl even if validation fails.
    // The preview renderer sanitizes HTML before serving it.
    const issues = validation.ok ? [] : (validation.issues || [])

    const previewVersion = sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : '0'
    const previewToken = signHtmlPreviewToken({
      sheetId: sheet.id,
      userId: req.user.userId,
      version: previewVersion,
      allowUnpublished: canModerateOrOwnSheet(sheet, req.user),
    })
    const previewUrl = `${resolvePreviewOrigin(req)}/preview/html?token=${encodeURIComponent(previewToken)}`

    res.json({
      id: sheet.id,
      title: sheet.title,
      status: sheet.status,
      updatedAt: sheet.updatedAt,
      previewUrl,
      expiresInSeconds: HTML_PREVIEW_TOKEN_TTL_SECONDS,
      sanitized: issues.length > 0,
      issues,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/download', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        content: true,
        contentFormat: true,
        status: true,
        allowDownloads: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'Downloads are unavailable for this sheet.')
    }
    if (!sheet.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this sheet.')
    }

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
    })

    const downloadAsHtml = sheet.contentFormat === 'html'
    res.setHeader('Content-Type', downloadAsHtml ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDownloadName(sheet.title, downloadAsHtml ? '.html' : '.md')}"`
    )
    /* Security headers — prevent script execution if browser opens the file inline */
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
    res.send(sheet.content)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/attachment', requireAuth, attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        status: true,
        attachmentUrl: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'Downloads are unavailable for this sheet.')
    }
    if (!sheet.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    if (!sheet.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this sheet.')
    }

    const localPath = resolveAttachmentPath(sheet.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
    })

    res.download(localPath, safeDownloadName(sheet.attachmentName || path.basename(localPath), path.extname(localPath)))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/attachment/preview', requireAuth, attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        status: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentType: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'Preview unavailable for this sheet.')
    }
    if (!sheet.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })

    const localPath = resolveAttachmentPath(sheet.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    await sendAttachmentPreview({
      res,
      localPath,
      attachmentName: sheet.attachmentName || path.basename(localPath),
      attachmentType: sheet.attachmentType || '',
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id', optionalAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
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

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    const [likeCount, dislikeCount, commentCount, starredRow, reactionRow, contributionCollections] = await Promise.all([
      prisma.reaction.count({ where: { sheetId, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId, type: 'dislike' } }),
      prisma.comment.count({ where: { sheetId } }),
      req.user
        ? prisma.starredSheet.findUnique({
            where: { userId_sheetId: { userId: req.user.userId, sheetId } },
          })
        : null,
      req.user
        ? prisma.reaction.findUnique({
            where: { userId_sheetId: { userId: req.user.userId, sheetId } },
          })
        : null,
      fetchContributionCollections(sheet, req.user || null),
    ])

    res.json({
      ...serializeSheet(sheet, {
        starred: Boolean(starredRow),
        commentCount,
        reactions: {
          likes: likeCount,
          dislikes: dislikeCount,
          userReaction: reactionRow ? reactionRow.type : null,
        },
      }),
      ...contributionCollections,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * Reads the user's defaultDownloads preference from UserPreferences.
 * Returns true if no preference record exists (safe default).
 */
async function getUserDefaultDownloads(userId) {
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { defaultDownloads: true },
  })
  return prefs?.defaultDownloads !== false
}

router.post('/', requireAuth, requireVerifiedEmail, sheetWriteLimiter, async (req, res) => {
  const { title, content, courseId, forkOf, description, allowDownloads } = req.body || {}
  const contentFormat = normalizeContentFormat(req.body?.contentFormat)
  const nextStatus = resolveNextSheetStatus({
    requestedStatus: req.body?.status,
    contentFormat,
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
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        htmlVersions: true,
      },
    })

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

router.post('/:id/fork', requireAuth, sheetWriteLimiter, async (req, res) => {
  const originalId = Number.parseInt(req.params.id, 10)

  try {
    const original = await prisma.studySheet.findUnique({
      where: { id: originalId },
      select: {
        id: true,
        title: true,
        description: true,
        content: true,
        contentFormat: true,
        courseId: true,
        userId: true,
        attachmentUrl: true,
        attachmentType: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!original) return res.status(404).json({ error: 'Sheet not found.' })

    const forkTitle = typeof req.body.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 160)
      : `${original.title} (fork)`

    const forked = await prisma.studySheet.create({
      data: {
        title: forkTitle,
        description: original.description || '',
        content: original.content,
        contentFormat: original.contentFormat || 'markdown',
        status: SHEET_STATUS.PUBLISHED,
        courseId: original.courseId,
        userId: req.user.userId,
        forkOf: original.id,
        attachmentUrl: original.attachmentUrl,
        attachmentType: original.attachmentType,
        attachmentName: original.attachmentName,
        allowDownloads: original.allowDownloads,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
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

    await prisma.studySheet.update({
      where: { id: original.id },
      data: { forks: { increment: 1 } },
    })

    await createNotification(prisma, {
      userId: original.userId,
      type: 'fork',
      message: `${req.user.username} forked your sheet "${original.title}".`,
      actorId: req.user.userId,
      sheetId: original.id,
      linkPath: `/sheets/${original.id}`,
    })

    res.status(201).json(serializeSheet(forked))

    /* Async content moderation — scan forked content under new author */
    if (isModerationEnabled()) {
      const textToScan = `${forkTitle} ${original.description || ''} ${original.contentFormat === 'markdown' ? original.content : ''}`.trim()
      if (textToScan) {
        void scanContent({ contentType: 'sheet', contentId: forked.id, text: textToScan, userId: req.user.userId })
      }
    }
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/contributions', requireAuth, contributionRateLimiter, async (req, res) => {
  const forkSheetId = Number.parseInt(req.params.id, 10)
  const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 500) : ''

  try {
    const forkSheet = await prisma.studySheet.findUnique({
      where: { id: forkSheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        forkOf: true,
      },
    })

    if (!forkSheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!forkSheet.forkOf) {
      return res.status(400).json({ error: 'Only forked sheets can be contributed back.' })
    }
    if (forkSheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return sendForbidden(res, 'Only the fork owner can contribute changes.')
    }

    const targetSheet = await prisma.studySheet.findUnique({
      where: { id: forkSheet.forkOf },
      select: { id: true, title: true, userId: true },
    })
    if (!targetSheet) return res.status(404).json({ error: 'Original sheet not found.' })
    if (targetSheet.userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot contribute back to your own sheet.' })
    }

    const pending = await prisma.sheetContribution.findFirst({
      where: {
        targetSheetId: targetSheet.id,
        forkSheetId,
        status: 'pending',
      },
      select: { id: true },
    })
    if (pending) {
      return res.status(409).json({ error: 'This fork already has a pending contribution.' })
    }

    const contribution = await prisma.sheetContribution.create({
      data: {
        targetSheetId: targetSheet.id,
        forkSheetId,
        proposerId: req.user.userId,
        message,
      },
      include: {
        proposer: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
        forkSheet: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    await createNotification(prisma, {
      userId: targetSheet.userId,
      type: 'contribution',
      message: `${req.user.username} wants to contribute changes to "${targetSheet.title}".`,
      actorId: req.user.userId,
      sheetId: targetSheet.id,
      linkPath: `/sheets/${targetSheet.id}`,
    })

    res.status(201).json({ contribution: serializeContribution(contribution) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/star', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const userId = req.user.userId

  try {
    const existing = await prisma.starredSheet.findUnique({
      where: { userId_sheetId: { userId, sheetId } },
    })

    const visibility = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, title: true },
    })
    if (!visibility) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(visibility, req.user)) return res.status(404).json({ error: 'Sheet not found.' })
    if (visibility.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'You can only star published sheets.')
    }

    let createdStar = false

    if (existing) {
      try {
        await prisma.starredSheet.delete({
          where: { userId_sheetId: { userId, sheetId } },
        })
      } catch (error) {
        if (error?.code !== 'P2025') {
          throw error
        }
      }
    } else {
      try {
        await prisma.starredSheet.create({ data: { userId, sheetId } })
        createdStar = true
      } catch (error) {
        if (error?.code !== 'P2002') {
          throw error
        }
      }
    }

    const [starCount, currentStar] = await Promise.all([
      prisma.starredSheet.count({ where: { sheetId } }),
      prisma.starredSheet.findUnique({
        where: { userId_sheetId: { userId, sheetId } },
      }),
    ])

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { stars: starCount },
    })

    if (createdStar) {
      await createNotification(prisma, {
        userId: visibility.userId,
        type: 'star',
        message: `${req.user.username} starred your sheet "${visibility.title || 'sheet'}".`,
        actorId: userId,
        sheetId,
        linkPath: `/sheets/${sheetId}`,
      })
    }

    return res.json({ stars: starCount, starred: Boolean(currentStar) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/download', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true, allowDownloads: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'Downloads are unavailable for this sheet.')
    }
    if (!sheet.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this sheet.')
    }

    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
      select: { downloads: true },
    })

    res.json({ downloads: updated.downloads })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/:id', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, attachmentUrl: true },
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

    await prisma.studySheet.delete({ where: { id: sheetId } })
    await cleanupAttachmentIfUnused(prisma, sheet.attachmentUrl, {
      route: req.originalUrl,
      sheetId,
    })
    res.json({ message: 'Sheet deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/comments', async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true, userId: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { sheetId },
        include: { author: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.comment.count({ where: { sheetId } }),
    ])

    res.json({ comments, total, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/comments', requireAuth, requireVerifiedEmail, commentLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, title: true, status: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    const comment = await prisma.comment.create({
      data: { content, sheetId, userId: req.user.userId },
      include: { author: { select: { id: true, username: true } } },
    })

    await createNotification(prisma, {
      userId: sheet.userId,
      type: 'comment',
      message: `${req.user.username} commented on your sheet "${sheet.title}".`,
      actorId: req.user.userId,
      sheetId,
      linkPath: `/sheets/${sheetId}`,
    })

    await notifyMentionedUsers(prisma, {
      text: content,
      actorId: req.user.userId,
      actorUsername: req.user.username,
      excludeUserIds: [sheet.userId],
      message: `${req.user.username} mentioned you in a comment on "${sheet.title}".`,
      linkPath: `/sheets/${sheetId}`,
    })

    res.status(201).json(comment)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/react', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const userId = req.user.userId
  const { type } = req.body || {}

  if (type !== null && type !== 'like' && type !== 'dislike') {
    return res.status(400).json({ error: 'Reaction type must be "like", "dislike", or null.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'Reactions are disabled until the sheet is published.')
    }

    const existing = await prisma.reaction.findUnique({
      where: { userId_sheetId: { userId, sheetId } },
    })

    if (!type || (existing && existing.type === type)) {
      if (existing) {
        try {
          await prisma.reaction.delete({ where: { userId_sheetId: { userId, sheetId } } })
        } catch (error) {
          if (error?.code !== 'P2025') {
            throw error
          }
        }
      }
    } else {
      await prisma.reaction.upsert({
        where: { userId_sheetId: { userId, sheetId } },
        update: { type },
        create: { userId, sheetId, type },
      })
    }

    const [likes, dislikes, current] = await Promise.all([
      prisma.reaction.count({ where: { sheetId, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId, type: 'dislike' } }),
      prisma.reaction.findUnique({
        where: { userId_sheetId: { userId, sheetId } },
      }),
    ])

    res.json({ likes, dislikes, userReaction: current ? current.type : null })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10)

  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: comment.userId,
      message: 'Not your comment.',
      targetType: 'sheet-comment',
      targetId: commentId,
    })) return

    await prisma.comment.delete({ where: { id: comment.id } })
    res.json({ message: 'Comment deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/sheets/contributions/:contributionId/diff — inline diff for contribution review ──

router.get('/contributions/:contributionId/diff', requireAuth, async (req, res) => {
  const contributionId = Number.parseInt(req.params.contributionId, 10)
  if (!Number.isInteger(contributionId)) {
    return res.status(400).json({ error: 'Invalid contribution ID.' })
  }

  try {
    const contribution = await prisma.sheetContribution.findUnique({
      where: { id: contributionId },
      include: {
        targetSheet: { select: { id: true, userId: true, content: true } },
        forkSheet: { select: { id: true, content: true } },
      },
    })

    if (!contribution) return res.status(404).json({ error: 'Contribution not found.' })

    // Only the target sheet owner, admin, or the proposer can view the diff
    const isTargetOwner = req.user.userId === contribution.targetSheet.userId
    const isProposer = req.user.userId === contribution.proposerId
    const isAdmin = req.user.role === 'admin'
    if (!isTargetOwner && !isProposer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this contribution diff.' })
    }

    const diff = computeLineDiff(
      contribution.targetSheet.content || '',
      contribution.forkSheet.content || ''
    )
    addWordSegments(diff.hunks)

    res.json({ diff })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
