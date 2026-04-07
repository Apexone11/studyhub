/**
 * studyGroups.controller.js — Study groups CRUD & membership handlers
 *
 * Exports 11 handler functions:
 * - listGroups
 * - createGroup
 * - getGroup
 * - updateGroup
 * - deleteGroup
 * - joinGroup
 * - leaveGroup
 * - listMembers
 * - updateMember
 * - removeMember
 * - inviteUser
 */

const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { createNotification } = require('../../lib/notify')
const { getUserPlan, isPro } = require('../../lib/getUserPlan')

const {
  parseId,
  requireGroupMember,
  isGroupAdmin,
  isGroupAdminOrMod,
  validateGroupName,
  validateDescription,
  formatGroup,
} = require('./studyGroups.helpers')

/**
 * GET /api/study-groups
 * List groups (public + user's groups) with filters
 */
async function listGroups(req, res) {
  try {
    const { search = '', courseId, schoolId, mine = false, limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)
    const courseIdNum = courseId ? parseId(courseId) : null
    const schoolIdNum = schoolId ? parseId(schoolId) : null
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
        schoolIdNum ? { course: { is: { schoolId: schoolIdNum } } } : {},
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
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

    const formatted = await Promise.all(groups.map((g) => formatGroup(g, req.user.userId)))

    res.json({ groups: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /api/study-groups
 * Create a new group
 */
async function createGroup(req, res) {
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

    /* Check private study group limits based on plan */
    if (privacy === 'private' || privacy === 'invite_only') {
      const userPlan = await getUserPlan(req.user.userId)
      try {
        const groupCount = await prisma.studyGroup.count({
          where: { createdById: req.user.userId, privacy: { in: ['private', 'invite_only'] } },
        })

        const maxGroups = isPro(userPlan) ? 10 : 2
        if (groupCount >= maxGroups) {
          return res.status(403).json({
            error: isPro(userPlan)
              ? 'You have reached the maximum of 10 private study groups.'
              : 'Free plan allows up to 2 private study groups. Upgrade to Pro for more.',
            code: 'GROUP_LIMIT',
          })
        }
      } catch {
        // If quota check fails, gracefully degrade and allow the creation
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
}

/**
 * GET /api/study-groups/:id
 * Get group details with membership status
 */
async function getGroup(req, res) {
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
      // Return 404 to avoid leaking that a private group exists
      return res.status(404).json({ error: 'Group not found.' })
    }

    const formatted = await formatGroup(group, req.user.userId)
    res.json(formatted)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * PATCH /api/study-groups/:id
 * Update group (admin only)
 */
async function updateGroup(req, res) {
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
      // Check private group limit when changing from public to private/invite_only
      if ((privacy === 'private' || privacy === 'invite_only') && group.privacy === 'public') {
        try {
          const { getUserPlan, isPro } = require('../../lib/getUserPlan')
          const userPlan = await getUserPlan(req.user.userId)
          if (!isPro(userPlan)) {
            const privateCount = await prisma.studyGroup.count({
              where: {
                createdById: req.user.userId,
                privacy: { in: ['private', 'invite_only'] },
              },
            })
            const limit = isPro(userPlan) ? 10 : 2
            if (privateCount >= limit) {
              return res.status(403).json({
                error: `You have reached your private group limit (${limit}). Upgrade to Pro for more.`,
                code: 'GROUP_LIMIT',
              })
            }
          }
        } catch {
          // Graceful degradation
        }
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
}

/**
 * DELETE /api/study-groups/:id
 * Delete group (creator/admin only)
 */
async function deleteGroup(req, res) {
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
}

/**
 * POST /api/study-groups/:id/join
 * Join public group or request to join private group
 */
async function joinGroup(req, res) {
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

    // Check if user already has a membership record
    const existingMember = await requireGroupMember(groupId, req.user.userId)
    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(400).json({ error: 'Already a member.' })
      }

      if (existingMember.status === 'pending') {
        return res.status(400).json({ error: 'Your join request is already pending.' })
      }

      if (existingMember.status === 'banned') {
        return res.status(403).json({ error: 'You are banned from this group.' })
      }

      if (existingMember.status === 'invited') {
        const updatedMember = await prisma.studyGroupMember.update({
          where: { id: existingMember.id },
          data: { status: 'active' },
        })

        return res.status(200).json({
          id: updatedMember.id,
          groupId: updatedMember.groupId,
          userId: updatedMember.userId,
          role: updatedMember.role,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
        })
      }

      return res.status(400).json({ error: 'Unable to join this group.' })
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
          userId: group.createdById,
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
}

/**
 * POST /api/study-groups/:id/leave
 * Leave a group
 */
async function leaveGroup(req, res) {
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
}

/**
 * GET /api/study-groups/:id/members
 * List group members with pagination
 */
async function listMembers(req, res) {
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

    const canManageMembers = Boolean(
      userMember
      && userMember.status === 'active'
      && (userMember.role === 'admin' || userMember.role === 'moderator')
    )

    const { limit = 20, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch {
      // Graceful degradation if block table doesn't exist
    }

    const memberWhere = {
      groupId,
      ...(canManageMembers ? {} : { status: 'active' }),
      userId: { notIn: blockedIds },
    }

    const [members, total] = await Promise.all([
      prisma.studyGroupMember.findMany({
        where: memberWhere,
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
        where: memberWhere,
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
}

/**
 * PATCH /api/study-groups/:id/members/:userId
 * Update member role or status (admin only)
 */
async function updateMember(req, res) {
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
}

/**
 * DELETE /api/study-groups/:id/members/:userId
 * Remove member (admin/moderator only)
 */
async function removeMember(req, res) {
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
}

/**
 * POST /api/study-groups/:id/invite
 * Invite a user (admin/moderator)
 */
async function inviteUser(req, res) {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const { userId, username } = req.body

    // Accept either userId (number) or username (string) for invite lookup
    let targetUserId = parseId(userId)

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

    // If username was provided instead of userId, look up the user
    let targetUser = null
    if (targetUserId !== null) {
      targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      })
    } else if (username && typeof username === 'string') {
      targetUser = await prisma.user.findUnique({
        where: { username: username.trim() },
      })
      if (targetUser) {
        targetUserId = targetUser.id
      }
    }

    if (targetUserId === null || !targetUser) {
      return res.status(404).json({ error: 'User not found.' })
    }

    // Check if target user exists (already fetched above)
    // This block remains for compatibility with the userId-only path
    if (!targetUser) {
      targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      })
    }
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' })
    }

    // Check if target user is blocked or blocks caller
    let blockedIds = []
    let callerBlockedByTarget = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch {
      // Graceful degradation if block table doesn't exist
    }
    try {
      callerBlockedByTarget = await getBlockedUserIds(prisma, targetUserId)
    } catch {
      // Graceful degradation if block table doesn't exist
    }

    if (blockedIds.includes(targetUserId)) {
      return res.status(403).json({ error: 'Cannot invite blocked user.' })
    }

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
}

module.exports = {
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
}
