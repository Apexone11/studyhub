/**
 * admin.security.controller.js — Phase 5 security monitoring endpoints.
 *
 * Provides aggregate stats for the admin Security tab:
 *   GET /api/admin/security/stats — failed logins, locked accounts,
 *       active users, recent signups, moderation actions.
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')

const router = express.Router()

/**
 * GET /api/admin/security/stats
 * Returns a snapshot of security-relevant metrics.
 */
router.get('/security/stats', async (req, res) => {
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      lockedAccounts,
      recentSignups24h,
      recentSignups7d,
      failedAttemptUsers,
      pendingSheetReviews,
      pendingGroupReports,
      pendingWaitlist,
      groupAuditActions24h,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      prisma.user.count({ where: { createdAt: { gte: last24h } } }),
      prisma.user.count({ where: { createdAt: { gte: last7d } } }),
      prisma.user.count({ where: { failedAttempts: { gte: 3 } } }),
      prisma.studySheet.count({ where: { status: 'pending_review' } }).catch(() => 0),
      prisma.groupReport.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.waitlist.count({ where: { status: 'waiting' } }).catch(() => 0),
      prisma.groupAuditLog.count({ where: { createdAt: { gte: last24h } } }).catch(() => 0),
    ])

    // Recent failed-login accounts (top 10 by failed attempts)
    const recentFailedAccounts = await prisma.user.findMany({
      where: { failedAttempts: { gte: 1 } },
      select: {
        id: true,
        username: true,
        failedAttempts: true,
        lockedUntil: true,
        lastFailedLoginAt: true,
      },
      orderBy: [{ failedAttempts: 'desc' }, { lastFailedLoginAt: 'desc' }],
      take: 10,
    })

    res.json({
      overview: {
        totalUsers,
        lockedAccounts,
        recentSignups24h,
        recentSignups7d,
        failedAttemptUsers,
        pendingSheetReviews,
        pendingGroupReports,
        pendingWaitlist,
        groupAuditActions24h,
      },
      recentFailedAccounts: recentFailedAccounts.map((u) => ({
        id: u.id,
        username: u.username,
        failedAttempts: u.failedAttempts,
        locked: u.lockedUntil && u.lockedUntil > now,
        lockedUntil: u.lockedUntil,
        lastAttempt: u.lastFailedLoginAt,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/admin/security/unlock/:userId
 * Manually unlock a locked account.
 */
router.post('/security/unlock/:userId', async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10)
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user ID.' })

    await prisma.user.update({
      where: { id: userId },
      data: { failedAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
    })

    res.json({ message: 'Account unlocked.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
