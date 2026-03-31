/**
 * studyGroups.routes.js — Study groups API
 *
 * Endpoints:
 * Group CRUD & Membership:
 * - GET/POST /api/study-groups
 * - GET/PATCH/DELETE /api/study-groups/:id
 * - POST /api/study-groups/:id/join
 * - POST /api/study-groups/:id/leave
 * - GET/PATCH/DELETE /api/study-groups/:id/members/:userId
 * - POST /api/study-groups/:id/invite
 *
 * Shared Resources:
 * - GET/POST /api/study-groups/:id/resources
 * - PATCH/DELETE /api/study-groups/:id/resources/:resourceId
 *
 * Scheduled Sessions:
 * - GET/POST /api/study-groups/:id/sessions
 * - PATCH/DELETE /api/study-groups/:id/sessions/:sessionId
 * - POST /api/study-groups/:id/sessions/:sessionId/rsvp
 *
 * Discussion Board:
 * - GET/POST /api/study-groups/:id/discussions
 * - GET/PATCH/DELETE /api/study-groups/:id/discussions/:postId
 * - POST/PATCH/DELETE /api/study-groups/:id/discussions/:postId/replies
 * - PATCH /api/study-groups/:id/discussions/:postId/resolve
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { createNotification } = require('../../lib/notify')

const router = express.Router()

// ===== HELPERS =====

/**
 * Parse an ID param with radix 10 and return null on NaN
 */
function parseId(val) {
  const parsed = parseInt(val, 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Get membership record or null
 */
async function requireGroupMember(groupId, userId) {
  return prisma.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
}

/**
 * Check if user is admin (returns boolean)
 */
async function isGroupAdmin(groupId, userId) {
  const member = await requireGroupMember(groupId, userId)
  return member && member.role === 'admin'
}

/**
 * Check if user is admin or moderator (returns boolean)
 */
async function isGroupAdminOrMod(groupId, userId) {
  const member = await requireGroupMember(groupId, userId)
  return member && (member.role === 'admin' || member.role === 'moderator')
}

/**
 * Strip HTML tags from user content
 */
function stripHtmlTags(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/<[^>]*>/g, '')
}

/**
 * Validate group name
 */
function validateGroupName(name) {
  const trimmed = (name || '').trim()
  if (!trimmed || trimmed.length < 1 || trimmed.length > 100) {
    return null
  }
  return trimmed
}

/**
 * Validate description
 */
function validateDescription(desc) {
  if (!desc) return ''
  const stripped = stripHtmlTags(desc)
  if (stripped.length > 2000) {
    return null // invalid
  }
  return stripped
}

/**
 * Validate title
 */
function validateTitle(title) {
  const trimmed = (title || '').trim()
  if (!trimmed || trimmed.length < 1 || trimmed.length > 200) {
    return null
  }
  return trimmed
}

/**
 * Format group for response (with counts)
 */
async function formatGroup(group, currentUserId = null) {
  const memberCount = await prisma.studyGroupMember.count({
    where: { groupId: group.id, status: 'active' },
  })

  let userMembership = null
  if (currentUserId) {
    userMembership = await requireGroupMember(group.id, currentUserId)
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    courseId: group.courseId,
    privacy: group.privacy,
    maxMembers: group.maxMembers,
    createdById: group.createdById,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    memberCount,
    userMembership: userMembership ? {
      id: userMembership.id,
      role: userMembership.role,
      status: userMembership.status,
      joinedAt: userMembership.joinedAt,
    } : null,
  }
}

// ===== GROUP CRUD & MEMBERSHIP =====

/**
 * GET /api/study-groups
 * List groups (public + user's groups) with filters
 */
router.get('/', readLimiter, requireAuth, async (req, res) => {
  try {
    const { search = '', courseId, mine = false, limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)
    const courseIdNum = courseId ? parseId(courseId) : null
    const isMine = mine === 'true' || mine === '1' || mine === true

    // Get user's group memberships
    let userGroupIds = []
    if (isMine) {
      const memberships = await prisma.studyGroupMember.findMany({
        where: {
          userId: req.user.userId,
          status: 'active',
        },
        select: { groupId: true },
      })
      userGroupIds = memberships.map((m) => m.groupId)
    }

    // Build where clause
    const where = {
      AND: [
        isMine ? { id: { in: userGroupIds } } : { privacy: 'public' },
        courseIdNum ? { courseId: courseIdNum } : {},
        search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        } : {},
      ],
    }

    const [groups, total] = await Promise.all([
      prisma.studyGroup.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.studyGroup.count({ where }),
    ])

    const formatted = await Promise.all(
      groups.map((g) => formatGroup(g, req.user.userId))
    )

    res.json({ groups: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups
 * Create a new group
 */
router.post('/', writeLimiter, requireAuth, async (req, res) => {
  try {
    const { name, description = '', courseId, privacy = 'public' } = req.body

    // Validate name
    const validName = validateGroupName(name)
    if (!validName) {
      return res.status(400).json({ error: 'Name required, max 100 chars.' })
    }

    // Validate description
    const validDesc = validateDescription(description)
    if (validDesc === null) {
      return res.status(400).json({ error: 'Description max 2000 chars.' })
    }

    // Validate privacy
    if (!['public', 'private', 'invite_only'].includes(privacy)) {
      return res.status(400).json({ error: 'Invalid privacy setting.' })
    }

    // Validate courseId if provided
    let courseIdNum = null
    if (courseId) {
      courseIdNum = parseId(courseId)
      if (courseIdNum === null) {
        return res.status(400).json({ error: 'Invalid courseId.' })
      }
      // Verify course exists
      const course = await prisma.course.findUnique({ where: { id: courseIdNum } })
      if (!course) {
        return res.status(404).json({ error: 'Course not found.' })
      }
    }

    // Create group with creator as admin
    const group = await prisma.studyGroup.create({
      data: {
        name: validName,
        description: validDesc,
        courseId: courseIdNum,
        privacy,
        createdById: req.user.userId,
        members: {
          create: {
            userId: req.user.userId,
            role: 'admin',
            status: 'active',
          },
        },
      },
    })

    const formatted = await formatGroup(group, req.user.userId)
    res.status(201).json(formatted)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/study-groups/:id
 * Get group details with membership status
 */
router.get('/:id', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check if user can see this group (public or member)
    const userMembership = await requireGroupMember(groupId, req.user.userId)
    if (group.privacy !== 'public' && !userMembership) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const formatted = await formatGroup(group, req.user.userId)
    res.json(formatted)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id
 * Update group (admin only)
 */
router.patch('/:id', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check admin permission
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' })
    }

    const { name, description, avatarUrl, privacy, maxMembers } = req.body
    const updates = {}

    if (name !== undefined) {
      const validName = validateGroupName(name)
      if (!validName) {
        return res.status(400).json({ error: 'Name required, max 100 chars.' })
      }
      updates.name = validName
    }

    if (description !== undefined) {
      const validDesc = validateDescription(description)
      if (validDesc === null) {
        return res.status(400).json({ error: 'Description max 2000 chars.' })
      }
      updates.description = validDesc
    }

    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl
    }

    if (privacy !== undefined) {
      if (!['public', 'private', 'invite_only'].includes(privacy)) {
        return res.status(400).json({ error: 'Invalid privacy setting.' })
      }
      updates.privacy = privacy
    }

    if (maxMembers !== undefined) {
      const max = parseInt(maxMembers, 10)
      if (Number.isNaN(max) || max < 1 || max > 1000) {
        return res.status(400).json({ error: 'Invalid maxMembers.' })
      }
      updates.maxMembers = max
    }

    updates.updatedAt = new Date()

    const updated = await prisma.studyGroup.update({
      where: { id: groupId },
      data: updates,
    })

    const formatted = await formatGroup(updated, req.user.userId)
    res.json(formatted)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id
 * Delete group (creator/admin only)
 */
router.delete('/:id', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Only creator can delete
    if (group.createdById !== req.user.userId) {
      return res.status(403).json({ error: 'Only creator can delete group.' })
    }

    await prisma.studyGroup.delete({
      where: { id: groupId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/join
 * Join public group or request to join private group
 */
router.post('/:id/join', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check if user is already a member
    const existingMember = await requireGroupMember(groupId, req.user.userId)
    if (existingMember) {
      return res.status(400).json({ error: 'Already a member.' })
    }

    // Check member count
    const activeCount = await prisma.studyGroupMember.count({
      where: { groupId, status: 'active' },
    })
    if (activeCount >= group.maxMembers) {
      return res.status(400).json({ error: 'Group is full.' })
    }

    // Public = auto-accept, private = pending, invite_only = reject
    let status = 'active'
    if (group.privacy === 'private') {
      status = 'pending'
    } else if (group.privacy === 'invite_only') {
      return res.status(403).json({ error: 'Invite only group.' })
    }

    const member = await prisma.studyGroupMember.create({
      data: {
        groupId,
        userId: req.user.userId,
        role: 'member',
        status,
      },
    })

    // Notify group creator if user joined (not pending)
    if (status === 'active') {
      try {
        await createNotification(prisma, {
          userId: group.creatorId,
          type: 'group_join',
          message: `${req.user.username} joined your study group ${group.name}`,
          actorId: req.user.userId,
          linkPath: `/study-groups/${groupId}`,
        })
      } catch (notifErr) {
        // Fire-and-forget: don't fail the request
        console.error('Failed to create notification:', notifErr.message)
      }
    }

    res.status(201).json({
      id: member.id,
      groupId: member.groupId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/leave
 * Leave a group
 */
router.post('/:id/leave', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    // If last admin, cannot leave
    if (member.role === 'admin') {
      const adminCount = await prisma.studyGroupMember.count({
        where: { groupId, role: 'admin', status: 'active' },
      })
      if (adminCount === 1) {
        return res.status(400).json({ error: 'Cannot leave: you are the last admin.' })
      }
    }

    await prisma.studyGroupMember.delete({
      where: { id: member.id },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/study-groups/:id/members
 * List group members with pagination
 */
router.get('/:id/members', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check membership or public group
    const userMember = await requireGroupMember(groupId, req.user.userId)
    if (group.privacy !== 'public' && !userMember) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    const blockedIds = await getBlockedUserIds(prisma, req.user.userId)

    const [members, total] = await Promise.all([
      prisma.studyGroupMember.findMany({
        where: {
          groupId,
          status: 'active',
          userId: { notIn: blockedIds },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.studyGroupMember.count({
        where: {
          groupId,
          status: 'active',
          userId: { notIn: blockedIds },
        },
      }),
    ])

    const formatted = members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    }))

    res.json({ members: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id/members/:userId
 * Update member role or status (admin only)
 */
router.patch('/:id/members/:userId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const userId = parseId(req.params.userId)

    if (groupId === null || userId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check admin permission
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' })
    }

    // Cannot edit self
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot edit yourself.' })
    }

    const targetMember = await requireGroupMember(groupId, userId)
    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found.' })
    }

    const { role, status } = req.body
    const updates = {}

    if (role !== undefined) {
      if (!['admin', 'moderator', 'member'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' })
      }
      updates.role = role
    }

    if (status !== undefined) {
      if (!['active', 'pending', 'invited', 'banned'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' })
      }
      updates.status = status
    }

    const updated = await prisma.studyGroupMember.update({
      where: { id: targetMember.id },
      data: updates,
    })

    // Notify user if status changes to active (join request approved)
    if (status === 'active' && targetMember.status !== 'active') {
      try {
        await createNotification(prisma, {
          userId: userId,
          type: 'group_approved',
          message: `Your request to join ${group.name} was approved`,
          actorId: req.user.userId,
          linkPath: `/study-groups/${groupId}`,
        })
      } catch (notifErr) {
        // Fire-and-forget: don't fail the request
        console.error('Failed to create notification:', notifErr.message)
      }
    }

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      role: updated.role,
      status: updated.status,
      joinedAt: updated.joinedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id/members/:userId
 * Remove member (admin/moderator only)
 */
router.delete('/:id/members/:userId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const userId = parseId(req.params.userId)

    if (groupId === null || userId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    // Cannot remove self
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot remove yourself.' })
    }

    const targetMember = await requireGroupMember(groupId, userId)
    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found.' })
    }

    // Mods cannot remove admins
    const caller = await requireGroupMember(groupId, req.user.userId)
    if (caller.role === 'moderator' && targetMember.role === 'admin') {
      return res.status(403).json({ error: 'Cannot remove admin.' })
    }

    await prisma.studyGroupMember.delete({
      where: { id: targetMember.id },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/invite
 * Invite a user (admin/moderator)
 */
router.post('/:id/invite', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const { userId } = req.body
    const targetUserId = parseId(userId)
    if (targetUserId === null) {
      return res.status(400).json({ error: 'Invalid target user ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    })
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' })
    }

    // Check if target user is blocked or blocks caller
    const blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    if (blockedIds.includes(targetUserId)) {
      return res.status(403).json({ error: 'Cannot invite blocked user.' })
    }

    // Check if target blocks caller (reverse check)
    const callerBlockedByTarget = await getBlockedUserIds(prisma, targetUserId)
    if (callerBlockedByTarget.includes(req.user.userId)) {
      return res.status(403).json({ error: 'User blocks you.' })
    }

    // Check existing membership
    const existing = await requireGroupMember(groupId, targetUserId)
    if (existing) {
      return res.status(400).json({ error: 'User already in group.' })
    }

    // Check member count
    const activeCount = await prisma.studyGroupMember.count({
      where: { groupId, status: 'active' },
    })
    if (activeCount >= group.maxMembers) {
      return res.status(400).json({ error: 'Group is full.' })
    }

    // Create with "invited" status
    const member = await prisma.studyGroupMember.create({
      data: {
        groupId,
        userId: targetUserId,
        role: 'member',
        status: 'invited',
      },
    })

    // Notify the invited user
    try {
      await createNotification(prisma, {
        userId: targetUserId,
        type: 'group_invite',
        message: `${req.user.username} invited you to join ${group.name}`,
        actorId: req.user.userId,
        linkPath: `/study-groups/${groupId}`,
      })
    } catch (notifErr) {
      // Fire-and-forget: don't fail the request
      console.error('Failed to create notification:', notifErr.message)
    }

    res.status(201).json({
      id: member.id,
      groupId: member.groupId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ===== SHARED RESOURCES =====

/**
 * GET /api/study-groups/:id/resources
 * List group resources (pinned first)
 */
router.get('/:id/resources', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { limit = 50, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    const [resources, total] = await Promise.all([
      prisma.groupResource.findMany({
        where: { groupId },
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.groupResource.count({ where: { groupId } }),
    ])

    const formatted = resources.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      userId: r.userId,
      user: r.user,
      title: r.title,
      description: r.description,
      resourceType: r.resourceType,
      resourceUrl: r.resourceUrl,
      sheetId: r.sheetId,
      noteId: r.noteId,
      pinned: r.pinned,
      createdAt: r.createdAt,
    }))

    res.json({ resources: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/resources
 * Add a resource (members only)
 */
router.post('/:id/resources', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { title, description = '', resourceType = 'link', resourceUrl, sheetId, noteId } = req.body

    // Validate title
    const validTitle = validateTitle(title)
    if (!validTitle) {
      return res.status(400).json({ error: 'Title required, max 200 chars.' })
    }

    // Validate description
    const validDesc = validateDescription(description)
    if (validDesc === null) {
      return res.status(400).json({ error: 'Description max 2000 chars.' })
    }

    // Validate resourceType
    if (!['link', 'sheet', 'note', 'file'].includes(resourceType)) {
      return res.status(400).json({ error: 'Invalid resourceType.' })
    }

    const resource = await prisma.groupResource.create({
      data: {
        groupId,
        userId: req.user.userId,
        title: validTitle,
        description: validDesc,
        resourceType,
        resourceUrl: resourceUrl || null,
        sheetId: sheetId ? parseId(sheetId) : null,
        noteId: noteId ? parseId(noteId) : null,
      },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.status(201).json({
      id: resource.id,
      groupId: resource.groupId,
      userId: resource.userId,
      user: resource.user,
      title: resource.title,
      description: resource.description,
      resourceType: resource.resourceType,
      resourceUrl: resource.resourceUrl,
      sheetId: resource.sheetId,
      noteId: resource.noteId,
      pinned: resource.pinned,
      createdAt: resource.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id/resources/:resourceId
 * Update resource (author or admin)
 */
router.patch('/:id/resources/:resourceId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const resourceId = parseId(req.params.resourceId)

    if (groupId === null || resourceId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const resource = await prisma.groupResource.findUnique({
      where: { id: resourceId },
    })

    if (!resource || resource.groupId !== groupId) {
      return res.status(404).json({ error: 'Resource not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (resource.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { title, description, resourceType, resourceUrl, pinned } = req.body
    const updates = {}

    if (title !== undefined) {
      const validTitle = validateTitle(title)
      if (!validTitle) {
        return res.status(400).json({ error: 'Title required, max 200 chars.' })
      }
      updates.title = validTitle
    }

    if (description !== undefined) {
      const validDesc = validateDescription(description)
      if (validDesc === null) {
        return res.status(400).json({ error: 'Description max 2000 chars.' })
      }
      updates.description = validDesc
    }

    if (resourceType !== undefined) {
      if (!['link', 'sheet', 'note', 'file'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType.' })
      }
      updates.resourceType = resourceType
    }

    if (resourceUrl !== undefined) {
      updates.resourceUrl = resourceUrl
    }

    if (pinned !== undefined && isAdmin) {
      updates.pinned = Boolean(pinned)
    }

    const updated = await prisma.groupResource.update({
      where: { id: resourceId },
      data: updates,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      user: updated.user,
      title: updated.title,
      description: updated.description,
      resourceType: updated.resourceType,
      resourceUrl: updated.resourceUrl,
      sheetId: updated.sheetId,
      noteId: updated.noteId,
      pinned: updated.pinned,
      createdAt: updated.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id/resources/:resourceId
 * Delete resource (author or admin)
 */
router.delete('/:id/resources/:resourceId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const resourceId = parseId(req.params.resourceId)

    if (groupId === null || resourceId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const resource = await prisma.groupResource.findUnique({
      where: { id: resourceId },
    })

    if (!resource || resource.groupId !== groupId) {
      return res.status(404).json({ error: 'Resource not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (resource.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    await prisma.groupResource.delete({
      where: { id: resourceId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ===== SCHEDULED SESSIONS =====

/**
 * GET /api/study-groups/:id/sessions
 * List sessions (upcoming first)
 */
router.get('/:id/sessions', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { limit = 50, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    const [sessions, total] = await Promise.all([
      prisma.groupSession.findMany({
        where: { groupId },
        include: {
          rsvps: {
            where: { userId: req.user.userId },
            select: { status: true },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.groupSession.count({ where: { groupId } }),
    ])

    const formatted = sessions.map((s) => ({
      id: s.id,
      groupId: s.groupId,
      title: s.title,
      description: s.description,
      location: s.location,
      scheduledAt: s.scheduledAt,
      durationMins: s.durationMins,
      recurring: s.recurring,
      status: s.status,
      userRsvpStatus: s.rsvps[0]?.status || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))

    res.json({ sessions: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/sessions
 * Create session (admin/moderator)
 */
router.post('/:id/sessions', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    const { title, description = '', location = '', scheduledAt, durationMins = 60, recurring } = req.body

    // Validate title
    const validTitle = validateTitle(title)
    if (!validTitle) {
      return res.status(400).json({ error: 'Title required, max 200 chars.' })
    }

    // Validate description
    const validDesc = validateDescription(description)
    if (validDesc === null) {
      return res.status(400).json({ error: 'Description max 2000 chars.' })
    }

    // Validate scheduledAt
    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt required.' })
    }
    const scheduledDate = new Date(scheduledAt)
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt.' })
    }

    // Validate durationMins
    const duration = parseInt(durationMins, 10)
    if (Number.isNaN(duration) || duration < 1 || duration > 1440) {
      return res.status(400).json({ error: 'durationMins must be 1-1440.' })
    }

    // Validate recurring
    if (recurring && !['weekly', 'biweekly'].includes(recurring)) {
      return res.status(400).json({ error: 'Invalid recurring value.' })
    }

    const session = await prisma.groupSession.create({
      data: {
        groupId,
        title: validTitle,
        description: validDesc,
        location,
        scheduledAt: scheduledDate,
        durationMins: duration,
        recurring: recurring || null,
      },
    })

    // Notify all active group members (except creator) about the new session
    try {
      const groupData = await prisma.studyGroup.findUnique({
        where: { id: groupId },
        select: { name: true },
      })

      const members = await prisma.studyGroupMember.findMany({
        where: {
          groupId,
          status: 'active',
          userId: { not: req.user.userId }, // exclude the session creator
        },
        select: { userId: true },
      })

      if (members.length > 0 && groupData) {
        await prisma.notification.createMany({
          data: members.map(member => ({
            userId: member.userId,
            type: 'group_session',
            message: `${req.user.username} scheduled a session in ${groupData.name}: ${validTitle}`,
            actorId: req.user.userId,
            linkPath: `/study-groups/${groupId}`,
          })),
          skipDuplicates: true,
        })
      }
    } catch (notifErr) {
      // Fire-and-forget: don't fail the request
      console.error('Failed to create notifications:', notifErr.message)
    }

    res.status(201).json({
      id: session.id,
      groupId: session.groupId,
      title: session.title,
      description: session.description,
      location: session.location,
      scheduledAt: session.scheduledAt,
      durationMins: session.durationMins,
      recurring: session.recurring,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id/sessions/:sessionId
 * Update session (admin/moderator)
 */
router.patch('/:id/sessions/:sessionId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const sessionId = parseId(req.params.sessionId)

    if (groupId === null || sessionId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.groupId !== groupId) {
      return res.status(404).json({ error: 'Session not found.' })
    }

    const { title, description, location, scheduledAt, durationMins, recurring, status } = req.body
    const updates = {}

    if (title !== undefined) {
      const validTitle = validateTitle(title)
      if (!validTitle) {
        return res.status(400).json({ error: 'Title required, max 200 chars.' })
      }
      updates.title = validTitle
    }

    if (description !== undefined) {
      const validDesc = validateDescription(description)
      if (validDesc === null) {
        return res.status(400).json({ error: 'Description max 2000 chars.' })
      }
      updates.description = validDesc
    }

    if (location !== undefined) {
      updates.location = location
    }

    if (scheduledAt !== undefined) {
      const scheduledDate = new Date(scheduledAt)
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduledAt.' })
      }
      updates.scheduledAt = scheduledDate
    }

    if (durationMins !== undefined) {
      const duration = parseInt(durationMins, 10)
      if (Number.isNaN(duration) || duration < 1 || duration > 1440) {
        return res.status(400).json({ error: 'durationMins must be 1-1440.' })
      }
      updates.durationMins = duration
    }

    if (recurring !== undefined) {
      if (recurring && !['weekly', 'biweekly'].includes(recurring)) {
        return res.status(400).json({ error: 'Invalid recurring value.' })
      }
      updates.recurring = recurring || null
    }

    if (status !== undefined) {
      if (!['upcoming', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' })
      }
      updates.status = status
    }

    updates.updatedAt = new Date()

    const updated = await prisma.groupSession.update({
      where: { id: sessionId },
      data: updates,
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      title: updated.title,
      description: updated.description,
      location: updated.location,
      scheduledAt: updated.scheduledAt,
      durationMins: updated.durationMins,
      recurring: updated.recurring,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id/sessions/:sessionId
 * Delete session (admin/moderator)
 */
router.delete('/:id/sessions/:sessionId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const sessionId = parseId(req.params.sessionId)

    if (groupId === null || sessionId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check mod+ permission
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isModOrAdmin) {
      return res.status(403).json({ error: 'Moderator access required.' })
    }

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.groupId !== groupId) {
      return res.status(404).json({ error: 'Session not found.' })
    }

    await prisma.groupSession.delete({
      where: { id: sessionId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/sessions/:sessionId/rsvp
 * RSVP to session (member)
 */
router.post('/:id/sessions/:sessionId/rsvp', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const sessionId = parseId(req.params.sessionId)

    if (groupId === null || sessionId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.groupId !== groupId) {
      return res.status(404).json({ error: 'Session not found.' })
    }

    const { status = 'going' } = req.body

    if (!['going', 'maybe', 'not_going'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' })
    }

    // Upsert RSVP
    const rsvp = await prisma.groupSessionRsvp.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: req.user.userId,
        },
      },
      create: {
        sessionId,
        userId: req.user.userId,
        status,
      },
      update: {
        status,
      },
    })

    res.json({
      id: rsvp.id,
      sessionId: rsvp.sessionId,
      userId: rsvp.userId,
      status: rsvp.status,
      createdAt: rsvp.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ===== DISCUSSION BOARD =====

/**
 * GET /api/study-groups/:id/discussions
 * List posts with filters, pagination, pinned first
 */
router.get('/:id/discussions', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { type, limit = 50, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    const where = {
      groupId,
      ...(type && { type }),
    }

    const [posts, total] = await Promise.all([
      prisma.groupDiscussionPost.findMany({
        where,
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          replies: { select: { id: true } },
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.groupDiscussionPost.count({ where }),
    ])

    const formatted = posts.map((p) => ({
      id: p.id,
      groupId: p.groupId,
      userId: p.userId,
      author: p.author,
      title: p.title,
      content: p.content,
      type: p.type,
      pinned: p.pinned,
      resolved: p.resolved,
      replyCount: p.replies.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    res.json({ posts: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/discussions
 * Create post (members)
 */
router.post('/:id/discussions', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { title, content, type = 'discussion' } = req.body

    // Validate title
    const validTitle = validateTitle(title)
    if (!validTitle) {
      return res.status(400).json({ error: 'Title required, max 200 chars.' })
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content required.' })
    }

    const strippedContent = stripHtmlTags(content)
    if (strippedContent.length > 5000) {
      return res.status(400).json({ error: 'Content max 5000 chars.' })
    }

    // Validate type
    if (!['discussion', 'question', 'announcement', 'poll'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type.' })
    }

    // Only admin/mod can create announcements
    if (type === 'announcement') {
      const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
      if (!isModOrAdmin) {
        return res.status(403).json({ error: 'Moderator access required for announcements.' })
      }
    }

    const post = await prisma.groupDiscussionPost.create({
      data: {
        groupId,
        userId: req.user.userId,
        title: validTitle,
        content: strippedContent,
        type,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    // Notify all active group members (except author) about the new discussion post
    try {
      const groupData = await prisma.studyGroup.findUnique({
        where: { id: groupId },
        select: { name: true },
      })

      const members = await prisma.studyGroupMember.findMany({
        where: {
          groupId,
          status: 'active',
          userId: { not: req.user.userId }, // exclude the post author
        },
        select: { userId: true },
      })

      if (members.length > 0 && groupData) {
        await prisma.notification.createMany({
          data: members.map(member => ({
            userId: member.userId,
            type: 'group_post',
            message: `${req.user.username} posted in ${groupData.name}: ${validTitle}`,
            actorId: req.user.userId,
            linkPath: `/study-groups/${groupId}`,
          })),
          skipDuplicates: true,
        })
      }
    } catch (notifErr) {
      // Fire-and-forget: don't fail the request
      console.error('Failed to create notifications:', notifErr.message)
    }

    res.status(201).json({
      id: post.id,
      groupId: post.groupId,
      userId: post.userId,
      author: post.author,
      title: post.title,
      content: post.content,
      type: post.type,
      pinned: post.pinned,
      resolved: post.resolved,
      replyCount: 0,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/study-groups/:id/discussions/:postId
 * Get post with replies
 */
router.get('/:id/discussions/:postId', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        replies: {
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    const formatted = {
      id: post.id,
      groupId: post.groupId,
      userId: post.userId,
      author: post.author,
      title: post.title,
      content: post.content,
      type: post.type,
      pinned: post.pinned,
      resolved: post.resolved,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      replies: post.replies.map((r) => ({
        id: r.id,
        postId: r.postId,
        userId: r.userId,
        author: r.author,
        content: r.content,
        isAnswer: r.isAnswer,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    }

    res.json(formatted)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id/discussions/:postId
 * Update post (author or admin)
 */
router.patch('/:id/discussions/:postId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (post.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { title, content, pinned } = req.body
    const updates = {}

    if (title !== undefined) {
      const validTitle = validateTitle(title)
      if (!validTitle) {
        return res.status(400).json({ error: 'Title required, max 200 chars.' })
      }
      updates.title = validTitle
    }

    if (content !== undefined) {
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content required.' })
      }
      const strippedContent = stripHtmlTags(content)
      if (strippedContent.length > 5000) {
        return res.status(400).json({ error: 'Content max 5000 chars.' })
      }
      updates.content = strippedContent
    }

    if (pinned !== undefined && isAdmin) {
      updates.pinned = Boolean(pinned)
    }

    updates.updatedAt = new Date()

    const updated = await prisma.groupDiscussionPost.update({
      where: { id: postId },
      data: updates,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      author: updated.author,
      title: updated.title,
      content: updated.content,
      type: updated.type,
      pinned: updated.pinned,
      resolved: updated.resolved,
      replyCount: 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id/discussions/:postId
 * Delete post (author or admin)
 */
router.delete('/:id/discussions/:postId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (post.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    await prisma.groupDiscussionPost.delete({
      where: { id: postId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/study-groups/:id/discussions/:postId/replies
 * Add reply to post
 */
router.post('/:id/discussions/:postId/replies', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    const { content, isAnswer = false } = req.body

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content required.' })
    }

    const strippedContent = stripHtmlTags(content)
    if (strippedContent.length > 5000) {
      return res.status(400).json({ error: 'Content max 5000 chars.' })
    }

    // Only post author can mark as answer
    let markAsAnswer = false
    if (isAnswer) {
      if (req.user.userId === post.userId || await isGroupAdmin(groupId, req.user.userId)) {
        markAsAnswer = true
      }
    }

    const reply = await prisma.groupDiscussionReply.create({
      data: {
        postId,
        userId: req.user.userId,
        content: strippedContent,
        isAnswer: markAsAnswer,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.status(201).json({
      id: reply.id,
      postId: reply.postId,
      userId: reply.userId,
      author: reply.author,
      content: reply.content,
      isAnswer: reply.isAnswer,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id/discussions/:postId/replies/:replyId
 * Update reply
 */
router.patch('/:id/discussions/:postId/replies/:replyId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)
    const replyId = parseId(req.params.replyId)

    if (groupId === null || postId === null || replyId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    const reply = await prisma.groupDiscussionReply.findUnique({
      where: { id: replyId },
    })

    if (!reply || reply.postId !== postId) {
      return res.status(404).json({ error: 'Reply not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (reply.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { content, isAnswer } = req.body
    const updates = {}

    if (content !== undefined) {
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content required.' })
      }
      const strippedContent = stripHtmlTags(content)
      if (strippedContent.length > 5000) {
        return res.status(400).json({ error: 'Content max 5000 chars.' })
      }
      updates.content = strippedContent
    }

    if (isAnswer !== undefined && (req.user.userId === post.userId || isAdmin)) {
      updates.isAnswer = Boolean(isAnswer)
    }

    updates.updatedAt = new Date()

    const updated = await prisma.groupDiscussionReply.update({
      where: { id: replyId },
      data: updates,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({
      id: updated.id,
      postId: updated.postId,
      userId: updated.userId,
      author: updated.author,
      content: updated.content,
      isAnswer: updated.isAnswer,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/study-groups/:id/discussions/:postId/replies/:replyId
 * Delete reply
 */
router.delete('/:id/discussions/:postId/replies/:replyId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)
    const replyId = parseId(req.params.replyId)

    if (groupId === null || postId === null || replyId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    const reply = await prisma.groupDiscussionReply.findUnique({
      where: { id: replyId },
    })

    if (!reply || reply.postId !== postId) {
      return res.status(404).json({ error: 'Reply not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (reply.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    await prisma.groupDiscussionReply.delete({
      where: { id: replyId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/study-groups/:id/discussions/:postId/resolve
 * Mark Q&A post as resolved (author or admin)
 */
router.patch('/:id/discussions/:postId/resolve', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    if (post.type !== 'question') {
      return res.status(400).json({ error: 'Only questions can be resolved.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (post.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { resolved = true } = req.body

    const updated = await prisma.groupDiscussionPost.update({
      where: { id: postId },
      data: {
        resolved: Boolean(resolved),
        updatedAt: new Date(),
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      author: updated.author,
      title: updated.title,
      content: updated.content,
      type: updated.type,
      pinned: updated.pinned,
      resolved: updated.resolved,
      replyCount: 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
