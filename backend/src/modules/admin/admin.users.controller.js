const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const { deleteUserAccount } = require('../../lib/deleteUserAccount')
const prisma = require('../../lib/prisma')
const { isSuperAdmin } = require('../../lib/superAdmin')
const { logModerationEvent } = require('../../lib/moderation/moderationLogger')
const { auditFromRequest, AUDIT_EVENTS } = require('../../lib/auditLog')
const { maskEmail } = require('../../lib/fieldEncryption')
const { PAGE_SIZE, parsePage } = require('./admin.constants')
const { DURATION_7D_MS } = require('../../lib/constants')

const router = express.Router()

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - DURATION_7D_MS)

    const [
      totalUsers,
      usersThisWeek,
      totalSheets,
      publishedSheets,
      draftSheets,
      totalComments,
      flaggedRequests,
      starAgg,
      totalNotes,
      totalFollows,
      totalReactions,
      totalFeedPosts,
      pendingCases,
      activeStrikes,
      pendingAppeals,
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
      prisma.strike
        .count({ where: { decayedAt: null, expiresAt: { gt: new Date() } } })
        .catch(() => 0),
      prisma.appeal.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.moderationCase
        .findMany({
          where: { status: { not: 'pending' } },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          include: {
            user: { select: { id: true, username: true } },
            reviewer: { select: { id: true, username: true } },
          },
        })
        .catch(() => []),
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
          trustLevel: true,
          isStaffVerified: true,
          email: true,
          createdAt: true,
          _count: { select: { studySheets: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.user.count(),
    ])
    const maskedUsers = users.map((u) => ({
      ...u,
      email: u.email ? maskEmail(u.email) : null,
    }))
    res.json({ users: maskedUsers, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/users/search — search by username, email, or displayName ──
router.get('/users/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters.' })
    }
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10, 10)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, displayName: true, email: true, avatarUrl: true },
      take: limit,
      orderBy: { username: 'asc' },
    })
    const maskedResults = users.map((u) => ({
      ...u,
      email: u.email ? maskEmail(u.email) : null,
    }))
    res.json(maskedResults)
  } catch (err) {
    captureError(err)
    res.status(500).json({ error: 'Search failed.' })
  }
})

// ── PATCH /api/admin/users/:id/role ──────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body || {}
  if (!['admin', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "admin" or "student".' })
  }
  const targetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ error: 'Invalid user id.' })
  }
  // Prevent removing your own admin role
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot change your own role.' })
  }
  try {
    // Protect the super admin from being demoted by other admins
    if (role !== 'admin' && (await isSuperAdmin(targetId))) {
      return res.status(403).json({
        error: 'The super admin account cannot be demoted.',
        code: 'SUPER_ADMIN_PROTECTED',
      })
    }
    const user = await prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, username: true, role: true },
    })
    auditFromRequest(req, AUDIT_EVENTS.AUTH_ROLE_CHANGE, { targetUserId: targetId })
    res.json(user)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/users/:id/trust-level ──────────────────
router.patch('/users/:id/trust-level', async (req, res) => {
  const { trustLevel } = req.body || {}
  if (!['new', 'trusted', 'restricted'].includes(trustLevel)) {
    return res.status(400).json({ error: 'Trust level must be "new", "trusted", or "restricted".' })
  }
  const targetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ error: 'User id must be a positive integer.' })
  }

  try {
    if (trustLevel === 'restricted' && (await isSuperAdmin(targetId))) {
      return res.status(403).json({
        error: 'The super admin account cannot be restricted.',
        code: 'SUPER_ADMIN_PROTECTED',
      })
    }

    const data = { trustLevel }
    if (trustLevel === 'trusted') data.trustedAt = new Date()
    if (trustLevel === 'new') data.trustedAt = null

    const user = await prisma.user.update({
      where: { id: targetId },
      data,
      select: { id: true, username: true, trustLevel: true, trustedAt: true },
    })

    await logModerationEvent({
      userId: targetId,
      action: 'trust_level_changed',
      reason: `Trust level set to ${trustLevel} by admin`,
      performedBy: req.user.userId,
      metadata: { newTrustLevel: trustLevel },
    })
    auditFromRequest(req, AUDIT_EVENTS.ADMIN_USER_EDIT, { targetUserId: targetId })

    res.json(user)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────
router.delete('/users/:id', async (req, res) => {
  const targetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ error: 'User id must be a positive integer.' })
  }
  if (targetId === req.user.userId) {
    return res
      .status(400)
      .json({ error: 'You cannot delete your own account through this endpoint.' })
  }
  try {
    // Protect the super admin from being deleted by other admins
    if (await isSuperAdmin(targetId)) {
      return res.status(403).json({
        error: 'The super admin account cannot be deleted.',
        code: 'SUPER_ADMIN_PROTECTED',
      })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true },
    })
    if (!targetUser) return res.status(404).json({ error: 'User not found.' })

    await deleteUserAccount(prisma, {
      userId: targetUser.id,
      username: targetUser.username,
    })
    auditFromRequest(req, AUDIT_EVENTS.ADMIN_USER_EDIT, { targetUserId: targetId })

    res.json({ message: 'User deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    if (err.code === 'P2003')
      return res
        .status(409)
        .json({ error: 'Cannot delete user: dependent records still exist. Contact support.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Deletion failed. Please try again or contact support.' })
  }
})

// ── PATCH /api/admin/users/:id/staff-verified ────────────────
router.patch('/users/:id/staff-verified', async (req, res) => {
  const targetId = Number.parseInt(req.params.id, 10)
  const { isStaffVerified } = req.body || {}

  if (typeof isStaffVerified !== 'boolean') {
    return res.status(400).json({ error: 'isStaffVerified must be a boolean.' })
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found.' })

    await prisma.user.update({
      where: { id: targetId },
      data: { isStaffVerified },
    })

    res.json({ message: `Staff verification ${isStaffVerified ? 'granted' : 'revoked'}.` })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
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

// GET /moderation/users/:userId/log — admin view of user's moderation history
router.get('/moderation/users/:userId/log', async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10)
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId.' })
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = 50

    const [items, total] = await Promise.all([
      prisma.moderationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.moderationLog.count({ where: { userId } }),
    ])
    res.json({ items, page, totalPages: Math.ceil(total / limit) || 1 })
  } catch (err) {
    console.error('[admin] Failed to load moderation log:', err.message)
    res.status(500).json({ error: 'Failed to load log.' })
  }
})

// GET /moderation/users/:userId/log/export — CSV export of moderation history
router.get('/moderation/users/:userId/log/export', async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10)
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId.' })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `moderation-log-${user.username}-${dateStr}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    // Write CSV header
    res.write('Date,Action,Case ID,Content Type,Content ID,Reason,Performed By,Metadata\n')

    // Stream in batches
    const batchSize = 100
    let skip = 0
    let hasMore = true

    while (hasMore) {
      const batch = await prisma.moderationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: batchSize,
      })

      for (const row of batch) {
        const fields = [
          row.createdAt.toISOString(),
          row.action,
          row.caseId ?? '',
          row.contentType ?? '',
          row.contentId ?? '',
          `"${(row.reason || '').replace(/"/g, '""')}"`,
          row.performedBy ?? 'system',
          row.metadata ? `"${JSON.stringify(row.metadata).replace(/"/g, '""')}"` : '',
        ]
        res.write(fields.join(',') + '\n')
      }

      skip += batchSize
      hasMore = batch.length === batchSize
    }

    res.end()
  } catch (err) {
    console.error('[admin] CSV export failed:', err.message)
    res.status(500).json({ error: 'Export failed.' })
  }
})

module.exports = router
