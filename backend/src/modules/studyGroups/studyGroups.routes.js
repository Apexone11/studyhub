/**
 * studyGroups.routes.js — Study groups API (main router with Group CRUD & Membership)
 *
 * SECURITY POLICY:
 * - All sub-resource endpoints (resources, sessions, discussions) require
 *   active group membership before access is granted.
 * - Private groups are invisible to non-members (404 instead of 403 to avoid
 *   leaking group existence).
 * - Admin/moderator role checks use group-level roles, never platform role.
 * - All user-submitted text (names, titles, descriptions, posts, replies) is
 *   sanitized through stripHtmlTags to prevent stored XSS.
 * - Resource URLs must be valid http/https.
 *
 * Endpoints (Group CRUD & Membership):
 * - GET/POST /api/study-groups
 * - GET/PATCH/DELETE /api/study-groups/:id
 * - POST /api/study-groups/:id/join
 * - POST /api/study-groups/:id/leave
 * - GET/PATCH/DELETE /api/study-groups/:id/members/:userId
 * - POST /api/study-groups/:id/invite
 *
 * Sub-routers mounted below:
 * - /resources (studyGroups.resources.routes.js)
 * - /sessions (studyGroups.sessions.routes.js)
 * - /discussions (studyGroups.discussions.routes.js)
 * - /activity (studyGroups.activity.routes.js)
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')

// Import controller
const {
  listGroups,
  createGroup,
  getGroup,
  updateGroup,
  deleteGroup,
  joinGroup,
  leaveGroup,
  listMembers,
  updateMember,
  removeMember,
  inviteUser,
} = require('./studyGroups.controller')

// Import sub-routers
const resourcesRouter = require('./studyGroups.resources.routes')
const sessionsRouter = require('./studyGroups.sessions.routes')
const discussionsRouter = require('./studyGroups.discussions.routes')
const activityRouter = require('./studyGroups.activity.routes')
const reportsRouter = require('./studyGroups.reports.routes')

const router = express.Router()

// ===== GROUP CRUD & MEMBERSHIP =====

/**
 * GET /api/study-groups
 * List groups (public + user's groups) with filters
 */
router.get('/', readLimiter, requireAuth, listGroups)

/**
 * POST /api/study-groups
 * Create a new group
 */
router.post('/', writeLimiter, requireAuth, createGroup)

/**
 * GET /api/study-groups/:id
 * Get group details with membership status
 */
router.get('/:id', readLimiter, requireAuth, getGroup)

/**
 * PATCH /api/study-groups/:id
 * Update group (admin only)
 */
router.patch('/:id', writeLimiter, requireAuth, updateGroup)

/**
 * DELETE /api/study-groups/:id
 * Delete group (creator/admin only)
 */
router.delete('/:id', writeLimiter, requireAuth, deleteGroup)

/**
 * POST /api/study-groups/:id/join
 * Join public group or request to join private group
 */
router.post('/:id/join', writeLimiter, requireAuth, joinGroup)

/**
 * POST /api/study-groups/:id/leave
 * Leave a group
 */
router.post('/:id/leave', writeLimiter, requireAuth, leaveGroup)

/**
 * GET /api/study-groups/:id/members
 * List group members with pagination
 */
router.get('/:id/members', readLimiter, requireAuth, listMembers)

/**
 * PATCH /api/study-groups/:id/members/:userId
 * Update member role or status (admin only)
 */
router.patch('/:id/members/:userId', writeLimiter, requireAuth, updateMember)

/**
 * DELETE /api/study-groups/:id/members/:userId
 * Remove member (admin/moderator only)
 */
router.delete('/:id/members/:userId', writeLimiter, requireAuth, removeMember)

/**
 * POST /api/study-groups/:id/invite
 * Invite a user (admin/moderator)
 */
router.post('/:id/invite', writeLimiter, requireAuth, inviteUser)

// ===== PHASE 5: GROUP BLOCKS =====

const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { parseId, isGroupAdminOrMod } = require('./studyGroups.helpers')
const { writeAuditLog } = require('./studyGroups.reports.service')

/**
 * POST /api/study-groups/:id/block/:userId
 * Block a user from a group (admin/moderator only).
 */
router.post('/:id/block/:userId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const targetUserId = parseId(req.params.userId)
    if (groupId === null || targetUserId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const isMod = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isMod) return res.status(403).json({ error: 'Admin or moderator access required.' })

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot block yourself.' })
    }

    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.replace(/<[^>]*>/g, '').trim().slice(0, 500)
      : ''

    // Upsert: if already blocked, just update reason.
    await prisma.groupBlock.upsert({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      update: { reason, blockedById: req.user.userId },
      create: { groupId, userId: targetUserId, blockedById: req.user.userId, reason },
    })

    // Remove any active membership so the blocked user loses access
    // immediately. Use deleteMany to avoid errors if the row doesn't exist.
    await prisma.studyGroupMember.deleteMany({
      where: { groupId, userId: targetUserId },
    })

    await writeAuditLog({
      groupId,
      actorId: req.user.userId,
      action: 'member.block',
      targetType: 'member',
      targetId: targetUserId,
      context: { reason },
      req,
    })

    res.json({ message: 'User blocked from group.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id/block/:userId
 * Unblock a user (admin/moderator only).
 */
router.delete('/:id/block/:userId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const targetUserId = parseId(req.params.userId)
    if (groupId === null || targetUserId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const isMod = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isMod) return res.status(403).json({ error: 'Admin or moderator access required.' })

    await prisma.groupBlock.deleteMany({
      where: { groupId, userId: targetUserId },
    })

    await writeAuditLog({
      groupId,
      actorId: req.user.userId,
      action: 'member.unblock',
      targetType: 'member',
      targetId: targetUserId,
      req,
    })

    res.json({ message: 'User unblocked.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/study-groups/:id/blocks
 * List blocked users (admin/moderator only).
 */
router.get('/:id/blocks', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) return res.status(400).json({ error: 'Invalid group ID.' })

    const isMod = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isMod) return res.status(403).json({ error: 'Admin or moderator access required.' })

    const blocks = await prisma.groupBlock.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        blockedBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      blocks: blocks.map((b) => ({
        id: b.id,
        userId: b.userId,
        user: b.user,
        blockedBy: b.blockedBy,
        reason: b.reason,
        createdAt: b.createdAt,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ===== SUB-ROUTER MOUNTS =====

// Mount sub-routers with mergeParams enabled in each sub-router
router.use('/:id/resources', resourcesRouter)
router.use('/:id/sessions', sessionsRouter)
router.use('/:id/discussions', discussionsRouter)
router.use('/:id/activity', activityRouter)
// Phase 5: /report, /appeal, /my-report all handled by the reports sub-router
router.use('/:id', reportsRouter)

module.exports = router
