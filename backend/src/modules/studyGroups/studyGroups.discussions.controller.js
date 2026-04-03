/**
 * studyGroups.discussions.controller.js — Discussion board handlers
 *
 * Extracted route logic for discussion CRUD, replies, voting, and real-time events.
 */

const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getIO } = require('../../lib/socketio')
const SOCKET_EVENTS = require('../../lib/socketEvents')
const {
  parseId,
  requireGroupMember,
  isGroupAdmin,
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
      const isAdmin = await isGroupAdmin(groupId, req.user.userId)
      if (!isAdmin) {
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
          data: members.map((member) => ({
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
