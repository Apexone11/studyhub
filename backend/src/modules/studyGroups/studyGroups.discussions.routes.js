/**
 * studyGroups.discussions.routes.js — Group discussions sub-router
 *
 * Discussion Board endpoints:
 * - GET/POST /api/study-groups/:id/discussions
 * - GET/PATCH/DELETE /api/study-groups/:id/discussions/:postId
 * - POST/PATCH/DELETE /api/study-groups/:id/discussions/:postId/replies/:replyId
 * - PATCH /api/study-groups/:id/discussions/:postId/resolve
 * - POST /api/study-groups/:id/discussions/:postId/upvote
 * - POST /api/study-groups/:id/discussions/:postId/replies/:replyId/upvote
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { parseId, isGroupAdminOrMod } = require('./studyGroups.helpers')
const { writeAuditLog } = require('./studyGroups.reports.service')

// Import controller
const {
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
} = require('./studyGroups.discussions.controller')

const router = express.Router({ mergeParams: true })

// CLAUDE.md A11 — every POST/PATCH/DELETE in this router is a discussion
// write that needs Origin defense in depth on top of the global Origin
// check. originAllowlist short-circuits GET/HEAD/OPTIONS so applying it
// at the router level is safe even though the file mixes reads + writes.
router.use(originAllowlist())

/**
 * GET /:id/discussions
 * List posts with filters, pagination, pinned first
 */
router.get('/', readLimiter, requireAuth, listDiscussions)

/**
 * POST /:id/discussions
 * Create post (members)
 */
router.post('/', writeLimiter, requireAuth, createDiscussion)

/**
 * GET /:id/discussions/:postId
 * Get post with replies
 */
router.get('/:postId', readLimiter, requireAuth, getDiscussion)

/**
 * PATCH /:id/discussions/:postId
 * Update post (author or admin)
 */
router.patch('/:postId', writeLimiter, requireAuth, updateDiscussion)

/**
 * DELETE /:id/discussions/:postId
 * Delete post (author or admin)
 */
router.delete('/:postId', writeLimiter, requireAuth, deleteDiscussion)

/**
 * POST /:id/discussions/:postId/replies
 * Add reply to post
 */
router.post('/:postId/replies', writeLimiter, requireAuth, createReply)

/**
 * PATCH /:id/discussions/:postId/replies/:replyId
 * Update reply
 */
router.patch('/:postId/replies/:replyId', writeLimiter, requireAuth, updateReply)

/**
 * DELETE /:id/discussions/:postId/replies/:replyId
 * Delete reply
 */
router.delete('/:postId/replies/:replyId', writeLimiter, requireAuth, deleteReply)

/**
 * PATCH /:id/discussions/:postId/resolve
 * Mark Q&A post as resolved (author or admin)
 */
router.patch('/:postId/resolve', writeLimiter, requireAuth, resolveDiscussion)

/**
 * POST /:id/discussions/:postId/upvote
 * Toggle upvote on a discussion post
 */
router.post('/:postId/upvote', writeLimiter, requireAuth, upvotePost)

/**
 * POST /:id/discussions/:postId/replies/:replyId/upvote
 * Toggle upvote on a discussion reply
 */
router.post('/:postId/replies/:replyId/upvote', writeLimiter, requireAuth, upvoteReply)

/**
 * PATCH /:id/discussions/:postId/approve
 * Phase 5 B.5: approve a pending-approval post (admin/mod only).
 */
router.patch('/:postId/approve', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)
    if (groupId === null || postId === null) return res.status(400).json({ error: 'Invalid IDs.' })

    const isMod = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isMod) return res.status(403).json({ error: 'Moderator access required.' })

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
      select: { id: true, groupId: true, status: true, userId: true, title: true },
    })
    if (!post || post.groupId !== groupId) return res.status(404).json({ error: 'Post not found.' })
    if (post.status !== 'pending_approval') {
      return res.status(400).json({ error: 'Post is not pending approval.' })
    }

    await prisma.groupDiscussionPost.update({
      where: { id: postId },
      data: { status: 'published' },
    })

    await writeAuditLog({
      groupId,
      actorId: req.user.userId,
      action: 'post.approve',
      targetType: 'post',
      targetId: postId,
      req,
    })

    // Notify the author that their pending post is now live so they
    // know to come back to the thread. Skipped when author == mod.
    if (post.userId !== req.user.userId) {
      try {
        const { createNotification } = require('../../lib/notify')
        await createNotification(prisma, {
          userId: post.userId,
          type: 'group_post_approved',
          message: `Your post "${post.title}" was approved`,
          actorId: req.user.userId,
          // Deep-link to Discussions tab + the specific post so the
          // notification click lands on the actual content the user is
          // being notified about (Copilot finding 2026-05-03).
          linkPath: `/study-groups/${groupId}?tab=discussions&post=${postId}`,
        })
      } catch {
        /* fire-and-forget */
      }
    }

    res.json({ message: 'Post approved.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /:id/discussions/:postId/reject
 * Phase 5 B.5: reject a pending-approval post (admin/mod only).
 * Marks the post as 'removed'.
 */
router.patch('/:postId/reject', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const postId = parseId(req.params.postId)
    if (groupId === null || postId === null) return res.status(400).json({ error: 'Invalid IDs.' })

    const isMod = await isGroupAdminOrMod(groupId, req.user.userId)
    if (!isMod) return res.status(403).json({ error: 'Moderator access required.' })

    const post = await prisma.groupDiscussionPost.findUnique({
      where: { id: postId },
      select: { id: true, groupId: true, status: true, userId: true },
    })
    if (!post || post.groupId !== groupId) return res.status(404).json({ error: 'Post not found.' })
    if (post.status !== 'pending_approval') {
      return res.status(400).json({ error: 'Post is not pending approval.' })
    }

    const updated = await prisma.groupDiscussionPost.update({
      where: { id: postId },
      data: { status: 'removed', removedAt: new Date(), removedById: req.user.userId },
      select: { id: true, title: true, userId: true },
    })

    await writeAuditLog({
      groupId,
      actorId: req.user.userId,
      action: 'post.reject',
      targetType: 'post',
      targetId: postId,
      req,
    })

    // Notify the author so they aren't left wondering why their post
    // disappeared. Skipped when author == mod (a mod rejecting their
    // own pending post is self-cancellation, not a notification event).
    if (updated.userId !== req.user.userId) {
      try {
        const { createNotification } = require('../../lib/notify')
        await createNotification(prisma, {
          userId: updated.userId,
          type: 'group_post_rejected',
          message: `Your post "${updated.title}" was rejected by a moderator`,
          actorId: req.user.userId,
          linkPath: `/study-groups/${groupId}?tab=discussions&post=${postId}`,
        })
      } catch {
        /* fire-and-forget */
      }
    }

    res.json({ message: 'Post rejected.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
