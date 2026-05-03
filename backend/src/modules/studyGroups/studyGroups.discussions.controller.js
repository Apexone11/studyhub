/**
 * studyGroups.discussions.controller.js — Discussion board handlers
 *
 * Extracted route logic for discussion CRUD, replies, voting, and real-time events.
 */

const { captureError } = require('../../monitoring/sentry')
const { createNotifications } = require('../../lib/notify')
const log = require('../../lib/logger')
const prisma = require('../../lib/prisma')
const { getIO } = require('../../lib/socketio')
const SOCKET_EVENTS = require('../../lib/socketEvents')
const {
  parseId,
  requireGroupMember,
  isGroupAdmin,
  isGroupAdminOrMod,
  isMutedInGroup,
  stripHtmlTags,
  validateTitle,
} = require('./studyGroups.helpers')

/**
 * GET /discussions
 * List posts with filters, pagination, pinned first
 */
async function listDiscussions(req, res) {
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

    // Phase 5 B.5: non-mods only see 'published' posts. Mods see
    // everything (including pending_approval and removed) so they can
    // approve/reject and audit. Authors also see their own pending posts.
    const canModerate = member && (member.role === 'admin' || member.role === 'moderator')
    const statusFilter = canModerate
      ? {} // mods see all statuses
      : {
          OR: [
            { status: 'published' },
            // Authors always see their own pending posts
            { status: 'pending_approval', userId: req.user.userId },
          ],
        }

    const where = {
      groupId,
      ...(type && { type }),
      ...statusFilter,
    }

    const [posts, total] = await Promise.all([
      prisma.groupDiscussionPost.findMany({
        where,
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          replies: { select: { id: true } },
          upvotes: { select: { userId: true } },
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
      status: p.status || 'published',
      attachments: p.attachments || null,
      replyCount: p.replies.length,
      upvoteCount: p.upvotes.length,
      userHasUpvoted: p.upvotes.some((u) => u.userId === req.user.userId),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    res.json({ posts: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /discussions
 * Create post (members)
 */
async function createDiscussion(req, res) {
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

    // Phase 5: muted users cannot create discussion posts.
    if (await isMutedInGroup(groupId, req.user.userId)) {
      return res
        .status(403)
        .json({ error: 'You are currently muted in this group and cannot post.' })
    }

    const { title, content, type = 'discussion', attachments } = req.body

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
      const isAdmin = await isGroupAdmin(groupId, req.user.userId)
      if (!isAdmin) {
        return res.status(403).json({ error: 'Moderator access required for announcements.' })
      }
    }

    // Phase 4: optional attachments array. Each attachment must be an
    // object that came from POST /resources/upload — only the internal
    // /uploads/group-media/... url is allowed through so arbitrary URLs
    // cannot be injected via this field. Capped at 4 per post.
    let validatedAttachments = null
    if (attachments != null) {
      if (!Array.isArray(attachments)) {
        return res.status(400).json({ error: 'attachments must be an array.' })
      }
      if (attachments.length > 4) {
        return res.status(400).json({ error: 'Max 4 attachments per post.' })
      }
      const allowedKinds = new Set(['image', 'video', 'file'])
      const normalized = []
      for (const raw of attachments) {
        if (!raw || typeof raw !== 'object') {
          return res.status(400).json({ error: 'Each attachment must be an object.' })
        }
        // Hardened path check (Loop B 2026-05-03 finding HIGH #4):
        // a bare `startsWith('/uploads/group-media/')` admits
        // protocol-relative URLs like `//evil.com/uploads/group-media/x`
        // (the leading `/` matches but `//` reroutes the browser to a
        // different host), URL-encoded prefixes that decode after the
        // check, and `..` traversal sequences. Reject anything that
        // contains another scheme separator (`//`), a `..` segment, a
        // backslash, or any percent-encoding — group-media URLs never
        // need any of those.
        if (
          typeof raw.url !== 'string' ||
          !raw.url.startsWith('/uploads/group-media/') ||
          raw.url.includes('//', 1) ||
          raw.url.includes('..') ||
          raw.url.includes('\\') ||
          raw.url.includes('%')
        ) {
          return res
            .status(400)
            .json({ error: 'attachment.url must be an uploaded /uploads/group-media/... path.' })
        }
        if (raw.kind && !allowedKinds.has(raw.kind)) {
          return res.status(400).json({ error: 'Invalid attachment.kind.' })
        }
        normalized.push({
          url: raw.url,
          mime: typeof raw.mime === 'string' ? raw.mime.slice(0, 120) : null,
          bytes: Number.parseInt(raw.bytes, 10) || null,
          kind: raw.kind || 'file',
        })
      }
      validatedAttachments = normalized
    }

    // Phase 5 B.5: if the group has post-approval enabled and the
    // caller is not a mod, new posts enter 'pending_approval' status.
    // Admins/mods bypass the queue — they ARE the moderators.
    let postStatus = 'published'
    try {
      const groupRow = await prisma.studyGroup.findUnique({
        where: { id: groupId },
        select: { requirePostApproval: true },
      })
      if (groupRow?.requirePostApproval) {
        const isModUser = await isGroupAdminOrMod(groupId, req.user.userId)
        if (!isModUser) {
          postStatus = 'pending_approval'
        }
      }
    } catch {
      // Graceful degradation — default to published
    }

    const post = await prisma.groupDiscussionPost.create({
      data: {
        groupId,
        userId: req.user.userId,
        title: validTitle,
        content: strippedContent,
        type,
        status: postStatus,
        ...(validatedAttachments ? { attachments: validatedAttachments } : {}),
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
        await createNotifications(
          prisma,
          members.map((member) => ({
            userId: member.userId,
            type: 'group_post',
            message: `${req.user.username} posted in ${groupData.name}: ${validTitle}`,
            actorId: req.user.userId,
            linkPath: `/study-groups/${groupId}`,
          })),
        )
      }
      // @mentions in the post body fire individual notifications. The
      // group-wide notification above is a generic "new post" ping;
      // a mention is a personal call-out and deserves its own row in
      // the recipient's bell with a distinct type so the frontend can
      // style it differently.
      const { notifyMentionedUsers } = require('../../lib/mentions')
      await notifyMentionedUsers(prisma, {
        text: strippedContent,
        actorId: req.user.userId,
        actorUsername: req.user.username,
        linkPath: `/study-groups/${groupId}`,
      })
    } catch (notifErr) {
      // Fire-and-forget: don't fail the request
      log.warn(
        { event: 'studyGroups.discussions.notify_failed', err: notifErr.message },
        'Failed to create discussion notifications',
      )
    }

    const formattedPost = {
      id: post.id,
      groupId: post.groupId,
      userId: post.userId,
      author: post.author,
      title: post.title,
      content: post.content,
      type: post.type,
      pinned: post.pinned,
      resolved: post.resolved,
      status: post.status || 'published',
      attachments: post.attachments || null,
      replyCount: 0,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }

    // Emit real-time event to group members
    try {
      const io = getIO()
      io.to(`studygroup:${groupId}`).emit(SOCKET_EVENTS.GROUP_DISCUSSION_NEW, formattedPost)
    } catch {
      /* fire-and-forget */
    }

    res.status(201).json(formattedPost)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * GET /discussions/:postId
 * Get post with replies
 */
async function getDiscussion(req, res) {
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

    // Phase 5: enforce the same visibility model as listDiscussions.
    // Non-mods cannot fetch pending_approval or removed posts unless
    // they are the author of the pending post.
    const canModerate = member && (member.role === 'admin' || member.role === 'moderator')
    if (!canModerate) {
      const isAuthor = post.userId === req.user.userId
      if (post.status === 'removed') {
        return res.status(404).json({ error: 'Post not found.' })
      }
      if (post.status === 'pending_approval' && !isAuthor) {
        return res.status(404).json({ error: 'Post not found.' })
      }
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
      status: post.status || 'published',
      attachments: post.attachments || null,
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
}

/**
 * PATCH /discussions/:postId
 * Update post (author or admin)
 */
async function updateDiscussion(req, res) {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Active-membership gate. createDiscussion + createReply already
    // require this; the edit / delete / resolve paths previously
    // skipped it, which let a removed user PATCH their own old post
    // after they'd been kicked from the group. Mirror the create-side
    // gate so post edits respect membership.
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    // Check permission. Editing the post body / title is restricted to
    // the author or an admin. Pinning is a moderator-tier action so we
    // also resolve `isModOrAdmin` and use that for the `pinned` field
    // specifically — the frontend pin button is shown to mods, and the
    // backend was silently ignoring the field for them before this
    // change (see Loop B finding HIGH #3, 2026-05-03).
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
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

    if (pinned !== undefined && isModOrAdmin) {
      updates.pinned = Boolean(pinned)
    }

    updates.updatedAt = new Date()

    const updated = await prisma.groupDiscussionPost.update({
      where: { id: postId },
      data: updates,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        _count: { select: { replies: true } },
      },
    })

    // Pin / unpin emits a notification to the post author so they know
    // a moderator promoted (or demoted) their thread. Skip when the
    // post-author is also the actor (mod pinning their own post is
    // a no-op signal). Only fires when the field actually flipped.
    if (
      updates.pinned !== undefined &&
      Boolean(updates.pinned) !== Boolean(post.pinned) &&
      post.userId !== req.user.userId
    ) {
      try {
        const { createNotification } = require('../../lib/notify')
        await createNotification(prisma, {
          userId: post.userId,
          type: 'group_post_pinned',
          message: updates.pinned
            ? `A moderator pinned your post "${updated.title}"`
            : `Your post "${updated.title}" was unpinned`,
          actorId: req.user.userId,
          linkPath: `/study-groups/${groupId}`,
        })
      } catch (notifErr) {
        log.warn(
          { event: 'studyGroups.discussions.pin_notify_failed', err: notifErr.message },
          'Failed to notify post author on pin',
        )
      }
    }

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
      attachments: updated.attachments || null,
      // Use the real reply count from Prisma's _count include. The
      // hook (`useGroupDiscussions.updatePost`) replaces the post in
      // local state with whatever the server returns, so a hardcoded 0
      // here would wipe the visible reply count from the UI on every
      // pin / edit. Same fix applied below in resolveDiscussion.
      replyCount: updated._count?.replies ?? 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * DELETE /discussions/:postId
 * Delete post (author or admin)
 */
async function deleteDiscussion(req, res) {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Active-membership gate (Loop B 2026-05-03 finding MED #7).
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
    })

    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    // Check permission (author or admin/mod)
    const isModOrAdmin = await isGroupAdminOrMod(groupId, req.user.userId)
    const isAuthor = post.userId === req.user.userId
    if (!isAuthor && !isModOrAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    // Phase 5 C.1: when a MOD removes someone else's post (not their own),
    // soft-delete it, increment the author's strike counter, and auto-ban
    // them if they've hit 2+ strikes within 30 days. Authors deleting their
    // own posts still hard-delete normally and incur no strikes.
    if (isModOrAdmin && !isAuthor) {
      // Soft-delete: mark as removed instead of hard-deleting.
      await prisma.groupDiscussionPost.update({
        where: { id: postId },
        data: { status: 'removed', removedAt: new Date(), removedById: req.user.userId },
      })

      // Increment the author's strike counter.
      const now = new Date()
      try {
        const authorMember = await prisma.studyGroupMember.findUnique({
          where: { groupId_userId: { groupId, userId: post.userId } },
        })
        if (authorMember) {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          // Reset counter if lastStrikeAt is older than 30 days.
          const resetCounter =
            !authorMember.lastStrikeAt || new Date(authorMember.lastStrikeAt) < thirtyDaysAgo
          const nextCount = resetCounter ? 1 : (authorMember.strikeCount || 0) + 1

          await prisma.studyGroupMember.update({
            where: { id: authorMember.id },
            data: { strikeCount: nextCount, lastStrikeAt: now },
          })

          // Auto-ban at 2 strikes in 30 days: change status to 'banned'.
          if (nextCount >= 2) {
            await prisma.studyGroupMember.update({
              where: { id: authorMember.id },
              data: { status: 'banned' },
            })

            // Audit the auto-ban.
            try {
              const { writeAuditLog } = require('./studyGroups.reports.service')
              await writeAuditLog({
                groupId,
                actorId: null, // system-automated action
                action: 'member.auto_ban',
                targetType: 'member',
                targetId: post.userId,
                context: { strikes: nextCount, window: '30d' },
                req,
              })
            } catch {
              /* audit never blocks */
            }
          }
        }
      } catch {
        // Non-fatal: strike tracking should not block the delete.
      }

      return res.status(204).send()
    }

    // Author self-delete: hard delete, no strikes.
    await prisma.groupDiscussionPost.delete({
      where: { id: postId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /discussions/:postId/replies
 * Add reply to post
 */
async function createReply(req, res) {
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
      if (req.user.userId === post.userId || (await isGroupAdmin(groupId, req.user.userId))) {
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

    const formattedReply = {
      id: reply.id,
      postId: reply.postId,
      groupId,
      userId: reply.userId,
      author: reply.author,
      content: reply.content,
      isAnswer: reply.isAnswer,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    }

    // Emit real-time event to group members
    try {
      const io = getIO()
      io.to(`studygroup:${groupId}`).emit(SOCKET_EVENTS.GROUP_DISCUSSION_REPLY, formattedReply)
    } catch {
      /* fire-and-forget */
    }

    // Notify the original post author (skip if the author is replying to
    // their own post, that's noise). Also notify @mentioned users in the
    // reply body. Both go through the standard notify pipeline so they
    // honor the user's notification preferences.
    try {
      if (post.userId !== req.user.userId) {
        const { createNotification } = require('../../lib/notify')
        await createNotification(prisma, {
          userId: post.userId,
          type: 'group_reply',
          message: `${req.user.username} replied to "${post.title}"`,
          actorId: req.user.userId,
          linkPath: `/study-groups/${groupId}`,
        })
      }
      const { notifyMentionedUsers } = require('../../lib/mentions')
      await notifyMentionedUsers(prisma, {
        text: strippedContent,
        actorId: req.user.userId,
        actorUsername: req.user.username,
        linkPath: `/study-groups/${groupId}`,
      })
    } catch (notifErr) {
      log.warn(
        { event: 'studyGroups.discussions.reply_notify_failed', err: notifErr.message },
        'Failed to notify on reply',
      )
    }

    res.status(201).json(formattedReply)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * PATCH /discussions/:postId/replies/:replyId
 * Update reply
 */
async function updateReply(req, res) {
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
}

/**
 * DELETE /discussions/:postId/replies/:replyId
 * Delete reply
 */
async function deleteReply(req, res) {
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
}

/**
 * PATCH /discussions/:postId/resolve
 * Mark Q&A post as resolved (author or admin)
 */
async function resolveDiscussion(req, res) {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)

    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    // Active-membership gate (Loop B 2026-05-03 finding MED #7).
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group.' })
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
        _count: { select: { replies: true } },
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
      attachments: updated.attachments || null,
      replyCount: updated._count?.replies ?? 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /discussions/:postId/upvote
 * Toggle upvote on a discussion post
 */
async function upvotePost(req, res) {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)
    if (groupId === null || postId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member || member.status !== 'active') {
      return res.status(403).json({ error: 'Active membership required.' })
    }

    const post = await prisma.groupDiscussionPost.findUnique({ where: { id: postId } })
    if (!post || post.groupId !== groupId) {
      return res.status(404).json({ error: 'Post not found.' })
    }

    // Toggle: check if already upvoted
    const existing = await prisma.discussionUpvote.findUnique({
      where: { postId_userId: { postId, userId: req.user.userId } },
    })

    if (existing) {
      await prisma.discussionUpvote.delete({ where: { id: existing.id } })
      const count = await prisma.discussionUpvote.count({ where: { postId } })
      return res.json({ upvoted: false, upvoteCount: count })
    }

    await prisma.discussionUpvote.create({
      data: { postId, userId: req.user.userId },
    })
    const count = await prisma.discussionUpvote.count({ where: { postId } })
    res.json({ upvoted: true, upvoteCount: count })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /discussions/:postId/replies/:replyId/upvote
 * Toggle upvote on a discussion reply
 */
async function upvoteReply(req, res) {
  try {
    const groupId = parseId(req.params.id)
    const replyId = parseId(req.params.replyId)
    if (groupId === null || replyId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member || member.status !== 'active') {
      return res.status(403).json({ error: 'Active membership required.' })
    }

    const reply = await prisma.groupDiscussionReply.findUnique({
      where: { id: replyId },
      include: { post: { select: { groupId: true } } },
    })
    if (!reply || reply.post.groupId !== groupId) {
      return res.status(404).json({ error: 'Reply not found.' })
    }

    const existing = await prisma.discussionUpvote.findUnique({
      where: { replyId_userId: { replyId, userId: req.user.userId } },
    })

    if (existing) {
      await prisma.discussionUpvote.delete({ where: { id: existing.id } })
      const count = await prisma.discussionUpvote.count({ where: { replyId } })
      return res.json({ upvoted: false, upvoteCount: count })
    }

    await prisma.discussionUpvote.create({
      data: { replyId, userId: req.user.userId },
    })
    const count = await prisma.discussionUpvote.count({ where: { replyId } })
    res.json({ upvoted: true, upvoteCount: count })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

module.exports = {
  listDiscussions,
  createDiscussion,
  getDiscussion,
  updateDiscussion,
  deleteDiscussion,
  createReply,
  updateReply,
  deleteReply,
  resolveDiscussion,
  upvotePost,
  upvoteReply,
}
