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
  isBlockedFromGroup,
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

    // Phase 5: hide groups the current user has an unresolved report on,
    // and hide groups that have been soft-deleted or locked (non-members
    // see nothing for locked/deleted; members keep reading but the UI
    // will render a banner). Graceful degradation via try/catch around
    // the reports service call.
    let hiddenGroupIds = new Set()
    try {
      const reportsService = require('./studyGroups.reports.service')
      hiddenGroupIds = await reportsService.getHiddenGroupIdsForReporter(req.user.userId)
    } catch {
      hiddenGroupIds = new Set()
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
        // Phase 5: exclude soft-deleted groups everywhere.
        { deletedAt: null },
        // Phase 5: exclude groups this user reported.
        hiddenGroupIds.size > 0
          ? { id: { notIn: Array.from(hiddenGroupIds) } }
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
    const { name, description = '', courseId, privacy = 'public', avatarUrl } = req.body

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
        avatarUrl: typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null,
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

    // Phase 5: soft-deleted groups 404 unless the caller is the owner
    // (owners still need detail access during their 30-day appeal
    // window) or a platform admin.
    if (group.deletedAt) {
      const isOwner = group.createdById === req.user.userId
      const isPlatformAdmin = req.user.role === 'admin'
      if (!isOwner && !isPlatformAdmin) {
        return res.status(404).json({ error: 'Group not found.' })
      }
    }

    // Phase 5: hide groups the caller has an unresolved report on.
    // Exception: platform admins and the group owner always see it.
    try {
      const isOwner = group.createdById === req.user.userId
      const isPlatformAdmin = req.user.role === 'admin'
      if (!isOwner && !isPlatformAdmin) {
        const reportsService = require('./studyGroups.reports.service')
        const hidden = await reportsService.getHiddenGroupIdsForReporter(req.user.userId)
        if (hidden.has(groupId)) {
          return res.status(404).json({ error: 'Group not found.' })
        }
      }
    } catch {
      // Graceful degradation — don't block the read if the reports
      // table is temporarily unavailable.
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

    const { name, description, avatarUrl, privacy, maxMembers, backgroundUrl, backgroundCredit, memberListPrivate, requirePostApproval } = req.body
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
      updates.avatarUrl = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null
    }

    // Phase 4: owner-curated group background. Accept only the internal
    // /uploads/group-media/... path or the curated-gallery /art/... path
    // — external URLs are rejected to prevent hotlinking / CSRF-via-image
    // tracking pixels. Null/empty clears the background.
    if (backgroundUrl !== undefined) {
      if (backgroundUrl === null || backgroundUrl === '') {
        updates.backgroundUrl = null
      } else if (typeof backgroundUrl !== 'string') {
        return res.status(400).json({ error: 'backgroundUrl must be a string.' })
      } else if (
        !backgroundUrl.startsWith('/uploads/group-media/')
        && !backgroundUrl.startsWith('/art/')
      ) {
        return res.status(400).json({ error: 'backgroundUrl must be an uploaded file or a curated gallery asset.' })
      } else {
        updates.backgroundUrl = backgroundUrl
      }
    }
    if (backgroundCredit !== undefined) {
      if (backgroundCredit === null || backgroundCredit === '') {
        updates.backgroundCredit = null
      } else if (typeof backgroundCredit !== 'string') {
        return res.status(400).json({ error: 'backgroundCredit must be a string.' })
      } else {
        // Sanitize: strip tags, cap length.
        updates.backgroundCredit = backgroundCredit.replace(/<[^>]*>/g, '').trim().slice(0, 200)
      }
    }

    // Phase 5 B.3: member-list visibility toggle
    if (memberListPrivate !== undefined) {
      updates.memberListPrivate = Boolean(memberListPrivate)
    }

    // Phase 5 B.5: post-approval queue toggle
    if (requirePostApproval !== undefined) {
      updates.requirePostApproval = Boolean(requirePostApproval)
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

    // Only creator (or platform admin) can delete
    if (group.createdById !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only creator can delete group.' })
    }

    // Phase 5 D.3: soft-delete with 30-day retention. A cron sweep
    // will hard-delete groups where deletedAt is older than 30 days.
    // This lets the owner appeal via the appeal endpoint during that
    // window. If the group was already soft-deleted, just 204.
    if (group.deletedAt) {
      return res.status(204).send()
    }

    await prisma.studyGroup.update({
      where: { id: groupId },
      data: {
        moderationStatus: 'deleted',
        deletedAt: new Date(),
        deletedById: req.user.userId,
      },
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

    // Phase 5: soft-deleted or locked groups cannot accept new members.
    if (group.deletedAt || group.moderationStatus === 'deleted') {
      return res.status(404).json({ error: 'Group not found.' })
    }
    if (group.moderationStatus === 'locked') {
      return res.status(403).json({ error: 'This group is currently locked and not accepting new members.' })
    }

    // Phase 5: block check — blocked users see a generic error (no
    // "you are blocked" reveal, matches the 404-for-private pattern).
    const blocked = await isBlockedFromGroup(groupId, req.user.userId)
    if (blocked) {
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

    // Phase 5: capture optional join message for private-group gate.
    const joinMessage = typeof req.body?.joinMessage === 'string'
      ? req.body.joinMessage.replace(/<[^>]*>/g, '').trim().slice(0, 500)
      : ''

    const member = await prisma.studyGroupMember.create({
      data: {
        groupId,
        userId: req.user.userId,
        role: 'member',
        status,
        ...(joinMessage ? { joinMessage } : {}),
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
        captureError(notifErr, { location: 'joinGroup/notifyActive', groupId })
      }
    }

    // Phase 5: when a user requests to join a private group (status
    // 'pending'), notify the FULL mod team (creator + admins + mods)
    // so any of them can approve. The notification links to the
    // members tab with a pending filter so the action is one click.
    if (status === 'pending') {
      try {
        const { createNotifications } = require('../../lib/notify')
        const modTeam = await prisma.studyGroupMember.findMany({
          where: {
            groupId,
            status: 'active',
            role: { in: ['admin', 'moderator'] },
          },
          select: { userId: true },
        })
        const recipientIds = new Set([group.createdById])
        for (const row of modTeam) recipientIds.add(row.userId)
        // Don't notify the requester even if they were somehow in the list
        recipientIds.delete(req.user.userId)

        if (recipientIds.size > 0) {
          const messageText = joinMessage
            ? `${req.user.username} requested to join ${group.name}: "${joinMessage}"`
            : `${req.user.username} requested to join ${group.name}`
          await createNotifications(prisma, Array.from(recipientIds).map((userId) => ({
            userId,
            type: 'group_join_request',
            message: messageText,
            actorId: req.user.userId,
            linkPath: `/study-groups/${groupId}?tab=members`,
            priority: 'medium',
          })))
        }
      } catch (notifErr) {
        captureError(notifErr, { location: 'joinGroup/notifyPending', groupId })
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

    // Phase 5 B.3: if memberListPrivate is true, non-members cannot
    // see the member roster. Admins/mods always see it regardless.
    const isMod = userMember && (userMember.role === 'admin' || userMember.role === 'moderator')
    if (group.memberListPrivate && !userMember && !isMod && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Member list is private.' })
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
      // Phase 5 B.2 + B.4: mute + join-gate message visible to mods only
      ...(canManageMembers ? {
        mutedUntil: m.mutedUntil || null,
        mutedReason: m.mutedReason || '',
        joinMessage: m.joinMessage || '',
        strikeCount: m.strikeCount || 0,
      } : {}),
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
