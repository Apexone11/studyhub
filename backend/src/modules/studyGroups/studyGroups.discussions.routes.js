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
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')

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

module.exports = router
