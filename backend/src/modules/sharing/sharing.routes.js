const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const requireAuth = require('../../middleware/auth')
const optionalAuth = require('../../core/auth/optionalAuth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { captureError } = require('../../monitoring/sentry')
const { isBlockedEitherWay } = require('../../lib/social/blockFilter')
const { watermarkHtml, watermarkText } = require('../../lib/watermark')
const prisma = require('../../lib/prisma')
const { sharingMutateLimiter, sharingReadLimiter } = require('../../lib/rateLimiters')

// Wave-11 (2026-05-14) — share-link password storage hardening.
// Pre-this-wave, `ShareLink.password` was stored in plaintext and compared
// with `!==`, which is both a credential-storage incident and a timing
// oracle. We now bcrypt-hash the password on create and use
// `bcrypt.compare` on access. Backwards compat: rows created before this
// wave have a plaintext value that doesn't start with `$2`; for those we
// fall back to a constant-time string compare and silently re-hash on the
// next successful access so the row converts in place.
const SHARE_LINK_BCRYPT_COST = 12
function looksLikeBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value)
}
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}
async function verifySharePassword(rawInput, storedHashOrPlain) {
  if (!storedHashOrPlain) return true
  if (typeof rawInput !== 'string') return false
  if (looksLikeBcryptHash(storedHashOrPlain)) {
    return bcrypt.compare(rawInput, storedHashOrPlain)
  }
  // Legacy plaintext row — constant-time compare. The caller is
  // responsible for re-hashing on a successful verify so the row
  // upgrades to bcrypt on next use.
  return constantTimeEquals(rawInput, storedHashOrPlain)
}

const router = express.Router()

const mutateLimiter = sharingMutateLimiter
const readLimiter = sharingReadLimiter

// ══════════════════════════════════════════════════════════════════════════
// Share Links (Public URL-based sharing with optional expiry/view limits)
// ══════════════════════════════════════════════════════════════════════════

// POST /api/sharing/links — Create a new share link
// A13: cap the optional `password` length so the ShareLink.password TEXT
// column never grows unbounded. 200 is generous for a passphrase while
// keeping the comparison and the storage row predictable.
const SHARE_LINK_PASSWORD_MAX = 200
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
    if (
      password !== undefined &&
      password !== null &&
      (typeof password !== 'string' || password.length > SHARE_LINK_PASSWORD_MAX)
    ) {
      return res.status(400).json({
        error: `password must be a string of ${SHARE_LINK_PASSWORD_MAX} characters or fewer.`,
      })
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

    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: content.userId,
        message: 'Only owner can create share links.',
        targetType: contentType,
        targetId: contentIdInt,
      })
    ) {
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
        // bcrypt-hash on store. Plain `password ?? null` was a
        // credential-storage incident — fixed wave-11 2026-05-14.
        password: password ? await bcrypt.hash(String(password), SHARE_LINK_BCRYPT_COST) : null,
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

    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: link.createdById,
        message: 'Only creator can revoke this link.',
        targetType: 'shareLink',
        targetId: linkId,
      })
    ) {
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

    // Check password protection — bcrypt-aware with legacy plaintext
    // fallback so existing rows keep working. On successful verify of a
    // plaintext row we re-hash so the row converts in place.
    if (shareLink.password) {
      if (!password) {
        return res.status(403).json({ error: 'Password required.' })
      }
      const ok = await verifySharePassword(password, shareLink.password)
      if (!ok) {
        return res.status(403).json({ error: 'Invalid password.' })
      }
      if (!looksLikeBcryptHash(shareLink.password)) {
        prisma.shareLink
          .update({
            where: { id: shareLink.id },
            data: { password: await bcrypt.hash(String(password), SHARE_LINK_BCRYPT_COST) },
          })
          .catch(() => {
            /* best-effort upgrade — next access will retry */
          })
      }
    }

    // Fetch content. Explicit `select` keeps the payload small — only the
    // columns the response actually uses are fetched (StudySheet in
    // particular has multi-kilobyte audit / scan / HTML columns this
    // route never serializes).
    let content
    if (shareLink.contentType === 'sheet') {
      content = await prisma.studySheet.findUnique({
        where: { id: shareLink.contentId },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          author: { select: { id: true, username: true } },
          course: { select: { id: true, code: true } },
        },
      })
    } else {
      content = await prisma.note.findUnique({
        where: { id: shareLink.contentId },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          author: { select: { id: true, username: true } },
          course: { select: { id: true, code: true } },
        },
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

    // Check password protection — bcrypt-aware, see verifySharePassword().
    if (shareLink.password) {
      if (!password) {
        return res.status(403).json({ error: 'Password required.' })
      }
      const ok = await verifySharePassword(password, shareLink.password)
      if (!ok) {
        return res.status(403).json({ error: 'Invalid password.' })
      }
      if (!looksLikeBcryptHash(shareLink.password)) {
        prisma.shareLink
          .update({
            where: { id: shareLink.id },
            data: { password: await bcrypt.hash(String(password), SHARE_LINK_BCRYPT_COST) },
          })
          .catch(() => {
            /* best-effort upgrade — next access will retry */
          })
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

    // Generate watermark text. toLocaleDateString() without
    // arguments would format using whatever locale + tz the Node
    // process was started with — that's non-deterministic across
    // Railway redeploys and renders unparseable formats for non-US
    // viewers. Stamp the UTC ISO date (YYYY-MM-DD) so every viewer
    // sees the same value regardless of where the server boots.
    const createdDate = new Date(content.createdAt).toISOString().slice(0, 10)
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

    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: content.userId,
        message: 'Only owner can share this content.',
        targetType: contentType,
        targetId: contentIdInt,
      })
    ) {
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
      })),
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

    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: share.sharedById,
        message: 'Only sharer can revoke this.',
        targetType: 'contentShare',
        targetId: shareId,
      })
    ) {
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
