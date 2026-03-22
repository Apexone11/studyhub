const express = require('express')
const requireAuth = require('../middleware/auth')
const requireAdmin = require('../middleware/requireAdmin')
const { captureError } = require('../monitoring/sentry')
const { deleteUserAccount } = require('../lib/deleteUserAccount')
const { validateHtmlForRuntime, classifyHtmlRisk, RISK_TIER } = require('../lib/htmlSecurity')
const { sanitizePreviewHtml } = require('../lib/htmlPreviewDocument')
const { isHtmlUploadsEnabled, setHtmlUploadsEnabled, readEnvOverride } = require('../lib/htmlKillSwitch')
const prisma = require('../lib/prisma')

const router = express.Router()

// All admin routes require auth + admin role
router.use(requireAuth)
router.use(requireAdmin)

const PAGE_SIZE = 20

function parsePage(value, defaultValue = 1) {
  const parsed = parseInt(value || String(defaultValue), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue
  return parsed
}

function parseSuppressionStatus(rawStatus) {
  const value = String(rawStatus || 'active').trim().toLowerCase()
  if (value === 'all' || value === 'inactive') return value
  return 'active'
}

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsers, usersThisWeek,
      totalSheets, publishedSheets, draftSheets,
      totalComments, flaggedRequests, starAgg,
      totalNotes, totalFollows, totalReactions,
      totalFeedPosts,
      pendingCases, activeStrikes, pendingAppeals,
      recentModerationActions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      prisma.studySheet.count(),
      prisma.studySheet.count({ where: { status: 'published' } }),
      prisma.studySheet.count({ where: { status: 'draft' } }),
      prisma.comment.count(),
      prisma.requestedCourse.count({ where: { flagged: true } }),
      prisma.studySheet.aggregate({ _sum: { stars: true } }),
      prisma.note.count(),
      prisma.userFollow.count(),
      prisma.reaction.count(),
      prisma.feedPost.count(),
      prisma.moderationCase.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.strike.count({ where: { decayedAt: null, expiresAt: { gt: new Date() } } }).catch(() => 0),
      prisma.appeal.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.moderationCase.findMany({
        where: { status: { not: 'pending' } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, username: true } },
          reviewer: { select: { id: true, username: true } },
        },
      }).catch(() => []),
    ])

    res.json({
      totalUsers,
      totalSheets,
      totalComments,
      flaggedRequests,
      totalStars: starAgg._sum.stars || 0,
      totalNotes,
      totalFollows,
      totalReactions,
      users: { total: totalUsers, thisWeek: usersThisWeek },
      sheets: { total: totalSheets, published: publishedSheets, draft: draftSheets },
      moderation: { pendingCases, activeStrikes, pendingAppeals },
      feedPosts: { total: totalFeedPosts },
      recentModerationActions,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/email-suppressions?status=active|inactive|all&page=1&q=mail ──
router.get('/email-suppressions', async (req, res) => {
  const page = parsePage(req.query.page)
  const status = parseSuppressionStatus(req.query.status)
  const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''

  const where = {}
  if (status === 'active') where.active = true
  if (status === 'inactive') where.active = false
  if (query) {
    where.email = {
      contains: query,
      mode: 'insensitive',
    }
  }

  try {
    const [suppressions, total] = await Promise.all([
      prisma.emailSuppression.findMany({
        where,
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.emailSuppression.count({ where }),
    ])

    return res.json({
      suppressions,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      status,
      query,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/email-suppressions/:id/unsuppress ───────────────────────
router.patch('/email-suppressions/:id/unsuppress', async (req, res) => {
  const suppressionId = parseInt(req.params.id, 10)
  if (!Number.isInteger(suppressionId)) {
    return res.status(400).json({ error: 'Suppression id must be an integer.' })
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 8) {
    return res.status(400).json({ error: 'Provide an unsuppress reason with at least 8 characters.' })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.emailSuppression.findUnique({
        where: { id: suppressionId },
      })

      if (!current) {
        return { notFound: true }
      }

      if (!current.active) {
        return { alreadyUnsuppressed: true, suppression: current }
      }

      const updated = await tx.emailSuppression.update({
        where: { id: suppressionId },
        data: { active: false },
      })

      await tx.emailSuppressionAudit.create({
        data: {
          suppressionId,
          action: 'manual-unsuppress',
          reason,
          performedByUserId: req.user.userId,
          context: {
            previousReason: current.reason,
            previousSourceEventType: current.sourceEventType,
            previousSourceEventId: current.sourceEventId,
          },
        },
      })

      return { suppression: updated }
    })

    if (result.notFound) {
      return res.status(404).json({ error: 'Suppression record not found.' })
    }

    if (result.alreadyUnsuppressed) {
      return res.status(400).json({ error: 'Suppression is already inactive.' })
    }

    return res.json({
      message: 'Recipient unsuppressed successfully.',
      suppression: result.suppression,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/email-suppressions/:id/audit?page=1 ───────────────────────
router.get('/email-suppressions/:id/audit', async (req, res) => {
  const suppressionId = parseInt(req.params.id, 10)
  if (!Number.isInteger(suppressionId)) {
    return res.status(400).json({ error: 'Suppression id must be an integer.' })
  }

  const page = parsePage(req.query.page)

  try {
    const suppression = await prisma.emailSuppression.findUnique({
      where: { id: suppressionId },
      select: { id: true, email: true, active: true },
    })

    if (!suppression) {
      return res.status(404).json({ error: 'Suppression record not found.' })
    }

    const [entries, total] = await Promise.all([
      prisma.emailSuppressionAudit.findMany({
        where: { suppressionId },
        orderBy: { createdAt: 'desc' },
        include: {
          performedBy: {
            select: { id: true, username: true },
          },
        },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.emailSuppressionAudit.count({ where: { suppressionId } }),
    ])

    return res.json({
      suppression,
      entries,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/users?page=1 ───────────────────────────────
router.get('/users', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          email: true,
          createdAt: true,
          _count: { select: { studySheets: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.user.count(),
    ])
    res.json({ users, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/sheets?page=1 ─────────────────────────────
router.get('/sheets', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.studySheet.count(),
    ])
    res.json({ sheets, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/sheets/review?status=pending_review&page=1 ───────────────
router.get('/sheets/review', async (req, res) => {
  const page = parsePage(req.query.page)
  const rawStatus = String(req.query.status || 'pending_review').trim().toLowerCase()
  const status = ['pending_review', 'rejected', 'draft', 'published', 'quarantined'].includes(rawStatus)
    ? rawStatus
    : 'pending_review'

  /* Optional filters: contentFormat, htmlScanStatus, tier */
  const rawFormat = String(req.query.contentFormat || '').trim().toLowerCase()
  const contentFormat = ['html', 'markdown'].includes(rawFormat) ? rawFormat : undefined

  const rawScan = String(req.query.htmlScanStatus || '').trim().toLowerCase()
  const htmlScanStatus = ['queued', 'running', 'passed', 'flagged', 'pending_review', 'quarantined'].includes(rawScan) ? rawScan : undefined

  const rawTier = parseInt(req.query.tier, 10)
  const tierFilter = Number.isInteger(rawTier) && rawTier >= 0 && rawTier <= 3 ? rawTier : undefined

  const where = {
    status,
    ...(contentFormat ? { contentFormat } : {}),
    ...(htmlScanStatus ? { htmlScanStatus } : {}),
    ...(tierFilter !== undefined ? { htmlRiskTier: tierFilter } : {}),
  }

  try {
    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
          reviewedBy: { select: { id: true, username: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.studySheet.count({ where }),
    ])
    res.json({ sheets, total, page, pages: Math.ceil(total / PAGE_SIZE), status, filters: { contentFormat, htmlScanStatus } })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/sheets/:id/review-detail ─────────────────────────
// Returns rawHtml (text), sanitizedHtml (safe), findings, and metadata
// for the side-by-side admin review UI.
router.get('/sheets/:id/review-detail', async (req, res) => {
  const sheetId = parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        reviewedBy: { select: { id: true, username: true } },
      },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    const rawHtml = sheet.contentFormat === 'html' ? sheet.content : null
    const sanitizedHtml = rawHtml ? sanitizePreviewHtml(rawHtml) : null
    const liveClassification = rawHtml ? classifyHtmlRisk(rawHtml) : { tier: 0, findings: [], summary: 'N/A' }

    res.json({
      id: sheet.id,
      title: sheet.title,
      description: sheet.description,
      contentFormat: sheet.contentFormat,
      status: sheet.status,
      rawHtml,
      sanitizedHtml,
      validationIssues: liveClassification.findings.map((f) => f.message),
      htmlRiskTier: sheet.htmlRiskTier || 0,
      liveRiskTier: liveClassification.tier,
      liveRiskSummary: liveClassification.summary,
      htmlScanStatus: sheet.htmlScanStatus,
      htmlScanFindings: sheet.htmlScanFindings || [],
      htmlScanAcknowledgedAt: sheet.htmlScanAcknowledgedAt,
      author: sheet.author,
      course: sheet.course,
      reviewedBy: sheet.reviewedBy,
      reviewedAt: sheet.reviewedAt,
      reviewReason: sheet.reviewReason,
      reviewFindingsSnapshot: sheet.reviewFindingsSnapshot,
      createdAt: sheet.createdAt,
      updatedAt: sheet.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/sheets/:id/review ─────────────────────────────
router.patch('/sheets/:id/review', async (req, res) => {
  const sheetId = parseInt(req.params.id, 10)
  const action = String(req.body?.action || '').trim().toLowerCase()
  const reason = String(req.body?.reason || '').trim()

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' })
  }
  const effectiveReason = reason
    || (action === 'approve' ? 'Approved by admin.' : 'Rejected by admin (quick reject).')

  try {
    const current = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        status: true,
        contentFormat: true,
        content: true,
        htmlScanFindings: true,
      },
    })
    if (!current) return res.status(404).json({ error: 'Sheet not found.' })

    if (current.contentFormat === 'html' && action === 'approve') {
      // Use runtime validation (allows inline scripts but blocks external scripts
      // and remote assets). The CSP + sandbox make inline scripts safe.
      const validation = validateHtmlForRuntime(current.content)
      if (!validation.ok) {
        return res.status(400).json({
          error: validation.issues[0],
          issues: validation.issues,
        })
      }
    }

    const nextStatus = action === 'approve' ? 'published' : 'rejected'
    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: {
        status: nextStatus,
        // On approve: clear risk tier (admin-verified safe). On reject: keep current tier.
        ...(action === 'approve' ? { htmlRiskTier: RISK_TIER.CLEAN, htmlScanStatus: 'passed' } : {}),
        reviewedById: req.user.userId,
        reviewedAt: new Date(),
        reviewReason: effectiveReason,
        reviewFindingsSnapshot: current.htmlScanFindings || [],
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        reviewedBy: { select: { id: true, username: true } },
      },
    })

    res.json({
      message: action === 'approve' ? 'Sheet approved and published.' : 'Sheet rejected.',
      sheet: updated,
    })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/users/:id/role ──────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body || {}
  if (!['admin', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "admin" or "student".' })
  }
  // Prevent removing your own admin role
  if (parseInt(req.params.id) === req.user.userId) {
    return res.status(400).json({ error: 'You cannot change your own role.' })
  }
  try {
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: { role },
      select: { id: true, username: true, role: true }
    })
    res.json(user)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/sheets/:id ─────────────────────────────
router.delete('/sheets/:id', async (req, res) => {
  try {
    await prisma.studySheet.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Sheet deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────
router.delete('/users/:id', async (req, res) => {
  const targetId = parseInt(req.params.id)
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'User id must be an integer.' })
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account through this endpoint.' })
  }
  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true },
    })
    if (!targetUser) return res.status(404).json({ error: 'User not found.' })

    await deleteUserAccount(prisma, {
      userId: targetUser.id,
      username: targetUser.username,
    })

    res.json({ message: 'User deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    if (err.code === 'P2003') return res.status(409).json({ error: 'Cannot delete user: dependent records still exist. Contact support.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Deletion failed. Please try again or contact support.' })
  }
})

// ── GET /api/admin/deletion-reasons?page=1 ───────────────────
router.get('/deletion-reasons', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [reasons, total] = await Promise.all([
      prisma.deletionReason.findMany({
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.deletionReason.count(),
    ])
    res.json({ reasons, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/announcements ─────────────────────────────
router.get('/announcements', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        include: { author: { select: { id: true, username: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.announcement.count(),
    ])
    res.json({ announcements, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/admin/announcements ────────────────────────────
router.post('/announcements', async (req, res) => {
  const { title, body, pinned } = req.body || {}
  if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body are required.' })
  try {
    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim().slice(0, 200),
        body: body.trim().slice(0, 2000),
        authorId: req.user.userId,
        pinned: Boolean(pinned),
      },
      include: { author: { select: { id: true, username: true } } },
    })
    res.status(201).json(announcement)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/announcements/:id/pin ───────────────────
router.patch('/announcements/:id/pin', async (req, res) => {
  try {
    const current = await prisma.announcement.findUnique({ where: { id: parseInt(req.params.id) } })
    if (!current) return res.status(404).json({ error: 'Announcement not found.' })
    const updated = await prisma.announcement.update({
      where: { id: current.id },
      data: { pinned: !current.pinned },
      include: { author: { select: { id: true, username: true } } },
    })
    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/announcements/:id ──────────────────────
router.delete('/announcements/:id', async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Announcement deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Announcement not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/settings/html-uploads ─────────────────────
// Returns the current state of the HTML uploads kill-switch.
router.get('/settings/html-uploads', async (req, res) => {
  try {
    const status = await isHtmlUploadsEnabled()
    const envOverride = readEnvOverride()
    res.json({
      enabled: status.enabled,
      source: status.source,
      envOverride,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/settings/html-uploads ────────────────────
// Toggle HTML uploads on or off. The DB value is always written;
// if the env var overrides, the response explains that clearly.
router.patch('/settings/html-uploads', async (req, res) => {
  const enabled = req.body?.enabled
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '"enabled" must be a boolean.' })
  }

  try {
    const result = await setHtmlUploadsEnabled(enabled, {
      adminUserId: req.user.userId,
    })

    const envLocked = result.envOverride != null
    res.json({
      enabled: result.enabled,
      dbValue: result.dbValue,
      source: result.source,
      envOverride: result.envOverride,
      message: envLocked
        ? `Database updated, but the STUDYHUB_HTML_UPLOADS env var ("${result.envOverride}") overrides the toggle.`
        : `HTML uploads ${result.enabled ? 'enabled' : 'disabled'}.`,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
