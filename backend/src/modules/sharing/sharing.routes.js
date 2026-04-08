const express = require('express')
const crypto = require('crypto')
const requireAuth = require('../../middleware/auth')
const optionalAuth = require('../../core/auth/optionalAuth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { captureError } = require('../../monitoring/sentry')
const { isBlockedEitherWay } = require('../../lib/social/blockFilter')
const { watermarkHtml, watermarkText } = require('../../lib/watermark')
const prisma = require('../../lib/prisma')
const { sharingMutateLimiter, sharingReadLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

const mutateLimiter = sharingMutateLimiter
const readLimiter = sharingReadLimiter

// ══════════════════════════════════════════════════════════════════════════
// Share Links (Public URL-based sharing with optional expiry/view limits)
// ══════════════════════════════════════════════════════════════════════════

// POST /api/sharing/links — Create a new share link
router.post('/links', requireAuth, mutateLimiter, async (req, res) => {
  const { contentType, contentId, permission, expiresAt, maxViews, password } = req.body

  try {
    // Validate input
    if (!contentType || !contentId) {
      return res.status(400).json({ error: 'contentType and contentId required.' })
    }
    if (!['sheet', 'note'].includes(contentType)) {
      return res.status(400).json({ error: 'contentType must be "sheet" or "note".' })
    }
    if (!['view', 'comment', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be "view", "comment", or "edit".' })
    }

    const contentIdInt = parseInt(contentId, 10)
    if (!Number.isInteger(contentIdInt) || contentIdInt < 1) {
      return res.status(400).json({ error: 'Invalid contentId.' })
    }

    // Fetch content to check ownership
    let content
    if (contentType === 'sheet') {
      content = await prisma.studySheet.findUnique({
        where: { id: contentIdInt },
        select: { id: true, userId: true },
      })
    } else {
      content = await prisma.note.findUnique({
        where: { id: contentIdInt },
        select: { id: true, userId: true },
      })
    }

    if (!content) {
      return res.status(404).json({ error: `${contentType} not found.` })
    }

    if (!assertOwnerOrAdmin({ res, user: req.user, ownerId: content.userId, message: 'Only owner can create share links.', targetType: contentType, targetId: contentIdInt })) {
      return
    }

    // Validate expiresAt if provided
    let expiresAtParsed = null
    if (expiresAt) {
      const parsed = new Date(expiresAt)
      if (isNaN(parsed.getTime()) || parsed <= new Date()) {
        return res.status(400).json({ error: 'expiresAt must be a valid future date.' })
      }
      expiresAtParsed = parsed
    }

    // Validate maxViews if provided
    let maxViewsInt = null
    if (maxViews !== undefined && maxViews !== null) {
      maxViewsInt = parseInt(maxViews, 10)
      if (!Number.isInteger(maxViewsInt) || maxViewsInt < 1) {
        return res.status(400).json({ error: 'maxViews must be a positive integer.' })
      }
    }

    // Create share link
    const shareLink = await prisma.shareLink.create({
      data: {
        token: crypto.randomUUID(),
        contentType,
        contentId: contentIdInt,
        createdById: req.user.userId,
        permission,
        expiresAt: expiresAtParsed,
        maxViews: maxViewsInt,
        password: password || null,
        active: true,
      },
    })

    res.json({
      id: shareLink.id,
      token: shareLink.token,
      url: `/api/sharing/access/${shareLink.token}`,
      permission: shareLink.permission,
      expiresAt: shareLink.expiresAt,
      maxViews: shareLink.maxViews,
      viewCount: shareLink.viewCount,
      active: shareLink.active,
      createdAt: shareLink.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// GET /api/sharing/links — List user's share links
router.get('/links', requireAuth, readLimiter, async (req, res) => {
  const { contentType, contentId } = req.query

  try {
    const where = { createdById: req.user.userId }

    if (contentType && ['sheet', 'note'].includes(contentType)) {
      where.contentType = contentType
    }

    if (contentId) {
      const contentIdInt = parseInt(contentId, 10)
      if (Number.isInteger(contentIdInt) && contentIdInt > 0) {
        where.contentId = contentIdInt
      }
    }

    const shareLinks = await prisma.shareLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        contentType: true,
        contentId: true,
        permission: true,
        expiresAt: true,
        maxViews: true,
        viewCount: true,
        active: true,
        createdAt: true,
      },
    })

    res.json(shareLinks)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// DELETE /api/sharing/links/:id — Revoke a share link
router.delete('/links/:id', requireAuth, mutateLimiter, async (req, res) => {
  const linkId = parseInt(req.params.id, 10)
  if (!Number.isInteger(linkId) || linkId < 1) {
    return res.status(400).json({ error: 'Invalid link id.' })
  }

  try {
    const link = await prisma.shareLink.findUnique({
      where: { id: linkId },
      select: { id: true, createdById: true },
    })

    if (!link) {
      return res.status(404).json({ error: 'Share link not found.' })
    }

    if (!assertOwnerOrAdmin({ res, user: req.user, ownerId: link.createdById, message: 'Only creator can revoke this link.', targetType: 'shareLink', targetId: linkId })) {
      return
    }

    await prisma.shareLink.delete({ where: { id: linkId } })
    res.json({ success: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ══════════════════════════════════════════════════════════════════════════
// Access via Share Link (Public endpoint)
// ══════════════════════════════════════════════════════════════════════════

// GET /api/sharing/access/:token — Resolve a share link and return content
router.get('/access/:token', optionalAuth, readLimiter, async (req, res) => {
  const { token } = req.params
  const { password } = req.query

  try {
    // Find share link
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      select: {
        id: true,
        contentType: true,
        contentId: true,
        permission: true,
        expiresAt: true,
        maxViews: true,
        viewCount: true,
        password: true,
        active: true,
        createdBy: { select: { id: true, username: true } },
      },
    })

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found.' })
    }

    // Check if link is active
    if (!shareLink.active) {
      return res.status(410).json({ error: 'Share link has been revoked.' })
    }

    // Check expiry
    if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
      return res.status(410).json({ error: 'Share link has expired.' })
    }

    // Check view count limit
    if (shareLink.maxViews && shareLink.viewCount >= shareLink.maxViews) {
      return res.status(410).json({ error: 'Share link view limit reached.' })
    }

    // Check password protection
    if (shareLink.password) {
      if (!password) {
        return res.status(403).json({ error: 'Password required.' })
      }
      if (password !== shareLink.password) {
        return res.status(403).json({ error: 'Invalid password.' })
      }
    }

    // Fetch content
    let content
    if (shareLink.contentType === 'sheet') {
      content = await prisma.studySheet.findUnique({
        where: { id: shareLink.contentId },
        include: { author: { select: { id: true, username: true } }, course: { select: { id: true, code: true } } },
      })
    } else {
      content = await prisma.note.findUnique({
        where: { id: shareLink.contentId },
        include: { author: { select: { id: true, username: true } }, course: { select: { id: true, code: true } } },
      })
    }

    if (!content) {
      return res.status(404).json({ error: `${shareLink.contentType} not found.` })
    }

    // Increment view count
    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { viewCount: { increment: 1 } },
    })

    // Build response with permission level
    const response = {
      contentType: shareLink.contentType,
      content: {
        id: content.id,
        title: content.title,
        content: content.content,
        author: content.author,
        course: content.course,
        createdAt: content.createdAt,
      },
      permission: shareLink.permission,
      viewCount: shareLink.viewCount + 1,
      maxViews: shareLink.maxViews,
    }

    res.json(response)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// GET /api/sharing/access/:token/watermarked — Return watermarked content
router.get('/access/:token/watermarked', optionalAuth, readLimiter, async (req, res) => {
  const { token } = req.params
  const { password } = req.query

  try {
    // Find share link
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      select: {
        id: true,
        contentType: true,
        contentId: true,
        permission: true,
        expiresAt: true,
        maxViews: true,
        viewCount: true,
        password: true,
        active: true,
        createdBy: { select: { username: true } },
      },
    })

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found.' })
    }

    // Check if link is active
    if (!shareLink.active) {
      return res.status(410).json({ error: 'Share link has been revoked.' })
    }

    // Check expiry
    if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
      return res.status(410).json({ error: 'Share link has expired.' })
    }

    // Check view count limit
    if (shareLink.maxViews && shareLink.viewCount >= shareLink.maxViews) {
      return res.status(410).json({ error: 'Share link view limit reached.' })
    }

    // Check password protection
    if (shareLink.password) {
      if (!password) {
        return res.status(403).json({ error: 'Password required.' })
      }
      if (password !== shareLink.password) {
        return res.status(403).json({ error: 'Invalid password.' })
      }
    }

    // Fetch content
    let content
    if (shareLink.contentType === 'sheet') {
      content = await prisma.studySheet.findUnique({
        where: { id: shareLink.contentId },
        select: { id: true, title: true, content: true, createdAt: true },
      })
    } else {
      content = await prisma.note.findUnique({
        where: { id: shareLink.contentId },
        select: { id: true, title: true, content: true, createdAt: true },
      })
    }

    if (!content) {
      return res.status(404).json({ error: `${shareLink.contentType} not found.` })
    }

    // Generate watermark text
    const createdDate = new Date(content.createdAt).toLocaleDateString()
    const watermarkMsg = `View Only - ${shareLink.createdBy.username} - ${createdDate}`

    // Increment view count
    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { viewCount: { increment: 1 } },
    })

    // Return watermarked content
    let watermarkedContent = content.content
    if (content.content.includes('<html') || content.content.includes('<body')) {
      watermarkedContent = watermarkHtml(content.content, watermarkMsg)
    } else {
      watermarkedContent = watermarkText(content.content, watermarkMsg)
    }

    res.json({
      contentType: shareLink.contentType,
      content: {
        id: content.id,
        title: content.title,
        content: watermarkedContent,
        createdAt: content.createdAt,
      },
      permission: shareLink.permission,
      viewCount: shareLink.viewCount + 1,
      maxViews: shareLink.maxViews,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ══════════════════════════════════════════════════════════════════════════
// Direct Shares (User-to-user permission grants)
// ══════════════════════════════════════════════════════════════════════════

// POST /api/sharing/direct — Share content with a specific user
router.post('/direct', requireAuth, mutateLimiter, async (req, res) => {
  const { contentType, contentId, sharedWithId, permission } = req.body

  try {
    // Validate input
    if (!contentType || !contentId || !sharedWithId) {
      return res.status(400).json({ error: 'contentType, contentId, and sharedWithId required.' })
    }
    if (!['sheet', 'note'].includes(contentType)) {
      return res.status(400).json({ error: 'contentType must be "sheet" or "note".' })
    }
    if (!['view', 'comment', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be "view", "comment", or "edit".' })
    }

    const contentIdInt = parseInt(contentId, 10)
    const sharedWithIdInt = parseInt(sharedWithId, 10)

    if (!Number.isInteger(contentIdInt) || contentIdInt < 1) {
      return res.status(400).json({ error: 'Invalid contentId.' })
    }
    if (!Number.isInteger(sharedWithIdInt) || sharedWithIdInt < 1) {
      return res.status(400).json({ error: 'Invalid sharedWithId.' })
    }

    // Cannot share with self
    if (sharedWithIdInt === req.user.userId) {
      return res.status(400).json({ error: 'Cannot share with yourself.' })
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: sharedWithIdInt },
      select: { id: true },
    })
    if (!recipient) {
      return res.status(404).json({ error: 'User not found.' })
    }

    // Check if blocked
    const blocked = await isBlockedEitherWay(prisma, req.user.userId, sharedWithIdInt)
    if (blocked) {
      return res.status(403).json({ error: 'Cannot share with blocked user.' })
    }

    // Fetch content to check ownership
    let content
    if (contentType === 'sheet') {
      content = await prisma.studySheet.findUnique({
        where: { id: contentIdInt },
        select: { id: true, userId: true },
      })
    } else {
      content = await prisma.note.findUnique({
        where: { id: contentIdInt },
        select: { id: true, userId: true },
      })
    }

    if (!content) {
      return res.status(404).json({ error: `${contentType} not found.` })
    }

    if (!assertOwnerOrAdmin({ res, user: req.user, ownerId: content.userId, message: 'Only owner can share this content.', targetType: contentType, targetId: contentIdInt })) {
      return
    }

    // Create or update share
    const share = await prisma.contentShare.upsert({
      where: {
        contentType_contentId_sharedWithId: {
          contentType,
          contentId: contentIdInt,
          sharedWithId: sharedWithIdInt,
        },
      },
      update: { permission },
      create: {
        contentType,
        contentId: contentIdInt,
        sharedById: req.user.userId,
        sharedWithId: sharedWithIdInt,
        permission,
      },
    })

    res.json({
      id: share.id,
      contentType: share.contentType,
      contentId: share.contentId,
      permission: share.permission,
      createdAt: share.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// GET /api/sharing/shared-with-me — List content shared with current user
router.get('/shared-with-me', requireAuth, readLimiter, async (req, res) => {
  const { contentType } = req.query

  try {
    const where = { sharedWithId: req.user.userId }

    if (contentType && ['sheet', 'note'].includes(contentType)) {
      where.contentType = contentType
    }

    const shares = await prisma.contentShare.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sharedBy: { select: { id: true, username: true } },
      },
    })

    res.json(
      shares.map((share) => ({
        id: share.id,
        contentType: share.contentType,
        contentId: share.contentId,
        permission: share.permission,
        sharedBy: share.sharedBy,
        createdAt: share.createdAt,
      }))
    )
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// DELETE /api/sharing/direct/:id — Revoke a direct share
router.delete('/direct/:id', requireAuth, mutateLimiter, async (req, res) => {
  const shareId = parseInt(req.params.id, 10)
  if (!Number.isInteger(shareId) || shareId < 1) {
    return res.status(400).json({ error: 'Invalid share id.' })
  }

  try {
    const share = await prisma.contentShare.findUnique({
      where: { id: shareId },
      select: { id: true, sharedById: true },
    })

    if (!share) {
      return res.status(404).json({ error: 'Share not found.' })
    }

    if (!assertOwnerOrAdmin({ res, user: req.user, ownerId: share.sharedById, message: 'Only sharer can revoke this.', targetType: 'contentShare', targetId: shareId })) {
      return
    }

    await prisma.contentShare.delete({ where: { id: shareId } })
    res.json({ success: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
