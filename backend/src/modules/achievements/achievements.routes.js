/**
 * achievements.routes.js — Public + authenticated read APIs and pin/share writes.
 *
 * Mounted at /api/achievements in backend/src/index.js.
 */

const express = require('express')
const prisma = require('../../lib/prisma')
const requireAuth = require('../../middleware/auth')
const optionalAuth = require('../../core/auth/optionalAuth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const service = require('./achievements.service')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/
function isValidSlug(value) {
  return typeof value === 'string' && SLUG_REGEX.test(value)
}
const USERNAME_REGEX = /^[A-Za-z0-9_.-]{1,50}$/
function isValidUsername(value) {
  return typeof value === 'string' && USERNAME_REGEX.test(value)
}

router.get('/', optionalAuth, readLimiter, async (req, res) => {
  try {
    const viewerId = req.user?.userId || null
    const items = await service.getCatalog({ viewerId, includeSecretLocked: Boolean(viewerId) })
    res.json({ items, total: items.length })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to load achievements catalog.', ERROR_CODES.INTERNAL)
  }
})

router.get('/stats', requireAuth, readLimiter, async (req, res) => {
  try {
    const stats = await service.getUserStats(req.user.userId)
    res.json({ stats })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to load achievement stats.', ERROR_CODES.INTERNAL)
  }
})

router.get('/users/:username', optionalAuth, readLimiter, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim()
    if (!isValidUsername(username))
      return sendError(res, 400, 'Invalid username.', ERROR_CODES.BAD_REQUEST)
    const target = await prisma.user.findUnique({
      where: { username },
      select: { id: true, isPrivate: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    const viewerId = req.user?.userId || null
    const isOwner = viewerId === target.id

    try {
      const stats = await prisma.userAchievementStats.findUnique({ where: { userId: target.id } })
      if (stats && stats.achievementsHidden && !isOwner) {
        return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
      }
    } catch {
      /* stats table missing - continue */
    }

    if (viewerId && viewerId !== target.id) {
      try {
        const { isBlockedEitherWay } = require('../../lib/social/blockFilter')
        const blocked = await isBlockedEitherWay(prisma, viewerId, target.id)
        if (blocked) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
      } catch {
        /* graceful degrade */
      }
    }

    const items = await service.getUserAchievements({
      targetUserId: target.id,
      viewerId,
      isOwner,
    })
    const stats = await service.getUserStats(target.id)
    res.json({ items, stats })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to load user achievements.', ERROR_CODES.INTERNAL)
  }
})

router.get('/users/:username/pinned', optionalAuth, readLimiter, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim()
    if (!isValidUsername(username))
      return sendError(res, 400, 'Invalid username.', ERROR_CODES.BAD_REQUEST)
    const target = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    try {
      const stats = await prisma.userAchievementStats.findUnique({ where: { userId: target.id } })
      const isOwner = req.user?.userId === target.id
      if (stats && stats.achievementsHidden && !isOwner) {
        return res.json({ items: [] })
      }
    } catch {
      /* stats table missing - continue */
    }
    const pinned = await prisma.userBadge.findMany({
      where: { userId: target.id, pinned: true },
      orderBy: [{ pinOrder: 'asc' }, { unlockedAt: 'desc' }],
      take: 6,
      include: { badge: true },
    })
    res.json({
      items: pinned.map((ub) => ({
        slug: ub.badge.slug,
        name: ub.badge.name,
        description: ub.badge.description,
        tier: ub.badge.tier,
        category: ub.badge.category,
        iconSlug: ub.badge.iconSlug || null,
        xp: ub.badge.xp,
        unlockedAt: ub.unlockedAt.toISOString(),
        pinOrder: ub.pinOrder,
      })),
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to load pinned achievements.', ERROR_CODES.INTERNAL)
  }
})

router.get('/:slug', optionalAuth, readLimiter, async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim()
    if (!isValidSlug(slug)) return sendError(res, 400, 'Invalid slug.', ERROR_CODES.BAD_REQUEST)
    const viewerId = req.user?.userId || null
    const data = await service.getBadge({ slug, viewerId })
    if (!data) return sendError(res, 404, 'Achievement not found.', ERROR_CODES.NOT_FOUND)
    // Loop-2 finding F-C: a secret badge's detail page returns 404 for any
    // viewer who doesn't hold it (authed or not). The service already strips
    // the name + description from the catalog response for non-holders, but
    // the detail endpoint exposes additional metadata (criteria, holder
    // counts, recent unlockers) that would leak the secret. 404 is cleanest.
    if (data.isSecret && !data.isUnlocked) {
      return sendError(res, 404, 'Achievement not found.', ERROR_CODES.NOT_FOUND)
    }
    res.json({ achievement: data })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to load achievement.', ERROR_CODES.INTERNAL)
  }
})

router.post('/pin', requireAuth, requireTrustedOrigin, writeLimiter, async (req, res) => {
  try {
    const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : ''
    if (!isValidSlug(slug)) return sendError(res, 400, 'slug is required.', ERROR_CODES.VALIDATION)
    const result = await service.setPinned({ userId: req.user.userId, slug, pinned: true })
    if (result.error === 'NOT_FOUND') {
      return sendError(res, 404, 'Achievement not found.', ERROR_CODES.NOT_FOUND)
    }
    if (result.error === 'NOT_OWNED') {
      return sendError(res, 403, 'You have not unlocked this achievement.', ERROR_CODES.FORBIDDEN)
    }
    if (result.error === 'MAX_PINNED') {
      return sendError(res, 409, 'You can pin at most 6 achievements.', ERROR_CODES.CONFLICT)
    }
    res.json({ ok: true })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to pin achievement.', ERROR_CODES.INTERNAL)
  }
})

router.delete('/pin/:slug', requireAuth, requireTrustedOrigin, writeLimiter, async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim()
    if (!isValidSlug(slug)) return sendError(res, 400, 'Invalid slug.', ERROR_CODES.BAD_REQUEST)
    const result = await service.setPinned({ userId: req.user.userId, slug, pinned: false })
    if (result.error === 'NOT_FOUND') {
      return sendError(res, 404, 'Achievement not found.', ERROR_CODES.NOT_FOUND)
    }
    if (result.error === 'NOT_OWNED') {
      return sendError(res, 403, 'You have not unlocked this achievement.', ERROR_CODES.FORBIDDEN)
    }
    res.json({ ok: true })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to unpin achievement.', ERROR_CODES.INTERNAL)
  }
})

router.patch('/visibility', requireAuth, requireTrustedOrigin, writeLimiter, async (req, res) => {
  try {
    const hidden = Boolean(req.body?.hidden)
    await service.setAchievementsHidden({ userId: req.user.userId, hidden })
    res.json({ ok: true, hidden })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    sendError(res, 500, 'Failed to update visibility.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
