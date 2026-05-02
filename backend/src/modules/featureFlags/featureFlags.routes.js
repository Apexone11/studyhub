const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const optionalAuth = require('../../core/auth/optionalAuth')
const prisma = require('../../lib/prisma')
const { evaluateFlag } = require('../../lib/featureFlags')
const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const { adminLimiter, readLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

// GET /api/flags — List all flags (admin only)
router.get('/', adminLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { createdAt: 'desc' },
    })
    res.json({ flags })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    return sendError(res, 500, 'Failed to list feature flags.', ERROR_CODES.SERVER_ERROR)
  }
})

// POST /api/flags — Create a flag (admin only)
router.post('/', adminLimiter, requireAuth, requireAdmin, async (req, res) => {
  const { name, description, enabled, rolloutPercentage, conditions } = req.body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return sendError(res, 400, 'Flag name is required.', ERROR_CODES.UPLOAD_INVALID)
  }

  try {
    const flag = await prisma.featureFlag.create({
      data: {
        name: name.trim(),
        description: description || undefined,
        enabled: typeof enabled === 'boolean' ? enabled : false,
        rolloutPercentage: typeof rolloutPercentage === 'number' ? rolloutPercentage : 0,
        conditions: conditions || undefined,
      },
    })
    res.status(201).json({ flag })
  } catch (err) {
    if (err.code === 'P2002') {
      return sendError(res, 409, 'A flag with that name already exists.', 'DUPLICATE')
    }
    captureError(err, { route: req.originalUrl })
    return sendError(res, 500, 'Failed to create feature flag.', ERROR_CODES.SERVER_ERROR)
  }
})

// PUT /api/flags/:name — Update a flag (admin only)
router.put('/:name', adminLimiter, requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.params
  const { description, enabled, rolloutPercentage, conditions } = req.body

  const data = {}
  if (typeof description === 'string') data.description = description
  if (typeof enabled === 'boolean') data.enabled = enabled
  if (typeof rolloutPercentage === 'number') data.rolloutPercentage = rolloutPercentage
  if (conditions !== undefined) data.conditions = conditions

  try {
    const flag = await prisma.featureFlag.update({
      where: { name },
      data,
    })
    res.json({ flag })
  } catch (err) {
    if (err.code === 'P2025') {
      return sendError(res, 404, 'Flag not found.', 'NOT_FOUND')
    }
    captureError(err, { route: req.originalUrl })
    return sendError(res, 500, 'Failed to update feature flag.', ERROR_CODES.SERVER_ERROR)
  }
})

// DELETE /api/flags/:name — Delete a flag (admin only)
router.delete('/:name', adminLimiter, requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.params

  try {
    await prisma.featureFlag.delete({
      where: { name },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') {
      return sendError(res, 404, 'Flag not found.', 'NOT_FOUND')
    }
    captureError(err, { route: req.originalUrl })
    return sendError(res, 500, 'Failed to delete feature flag.', ERROR_CODES.SERVER_ERROR)
  }
})

// GET /api/flags/evaluate/:name — Evaluate a flag for the current viewer.
// Public on purpose: shipped flags gate signup-flow surfaces (Google OAuth
// picker, role picker) that anonymous users on /register need to evaluate
// BEFORE they have a session. Requiring auth here is a chicken-and-egg
// bug — it 401s on /register, fail-closed flips the gate to disabled,
// and Google signups silently break. Anonymous evaluation falls back to
// `userId: null` which `evaluateFlag()` handles: percentage rollouts <
// 100% return NO_USER_FOR_ROLLOUT (still fail-closed, no leak), but a
// fully shipped flag (enabled=true, rollout=100%) returns ENABLED so
// the picker actually appears.
router.get('/evaluate/:name', readLimiter, optionalAuth, async (req, res) => {
  try {
    const result = await evaluateFlag(req.params.name, {
      userId: req.user?.userId || null,
      role: req.user?.role || null,
    })
    res.json({ enabled: result.enabled, reason: result.reason })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    return sendError(res, 500, 'Failed to evaluate feature flag.', ERROR_CODES.SERVER_ERROR)
  }
})

module.exports = router
