/**
 * studyGroups.activity.routes.js — Group activity feed sub-router
 *
 * Activity Feed endpoints:
 * - GET /api/study-groups/:id/activity
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter } = require('../../lib/rateLimiters')
const { parseId, requireGroupMember } = require('./studyGroups.helpers')

const router = express.Router({ mergeParams: true })

/**
 * GET /:id/activity
 * Returns recent group activity (posts, resources, members, sessions)
 */
router.get('/', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30)

    // Fetch recent items in parallel
    const [recentPosts, recentResources, recentMembers, upcomingSessions] = await Promise.all([
      prisma.groupDiscussionPost.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      prisma.groupResource.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          resourceType: true,
          createdAt: true,
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      prisma.studyGroupMember.findMany({
        where: { groupId, status: 'active' },
        orderBy: { joinedAt: 'desc' },
        take: limit,
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      prisma.groupSession.findMany({
        where: {
          groupId,
          scheduledAt: { gte: new Date() },
          status: { in: ['upcoming', 'in_progress'] },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: { id: true, title: true, scheduledAt: true, location: true, status: true },
      }),
    ])

    // Merge into a unified activity feed sorted by date
    const activities = []

    for (const p of recentPosts) {
      activities.push({
        type: 'discussion',
        subType: p.type,
        id: p.id,
        title: p.title,
        actor: p.author,
        timestamp: p.createdAt,
      })
    }

    for (const r of recentResources) {
      activities.push({
        type: 'resource',
        subType: r.resourceType,
        id: r.id,
        title: r.title,
        actor: r.user,
        timestamp: r.createdAt,
      })
    }

    for (const m of recentMembers) {
      activities.push({
        type: 'member_joined',
        id: m.userId,
        title: m.user?.username || 'Unknown',
        actor: m.user,
        role: m.role,
        timestamp: m.joinedAt,
      })
    }

    // Sort by timestamp descending, take top N
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    res.json({
      activities: activities.slice(0, limit),
      upcomingSessions,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
