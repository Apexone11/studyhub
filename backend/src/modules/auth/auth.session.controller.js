const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const {
  clearAuthCookie,
  getAuthTokenFromRequest,
  verifyAuthToken,
} = require('../../lib/authTokens')
const requireAuth = require('../../middleware/auth')
const { logoutLimiter } = require('./auth.constants')
const {
  sessionListLimiter,
  sessionRevokeLimiter,
  loginActivityLimiter,
} = require('../../lib/rateLimiters')
const { getAuthenticatedUser, buildSessionUserPayload } = require('./auth.service')
const prisma = require('../../lib/prisma')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

const router = express.Router()

router.post('/logout', logoutLimiter, (req, res) => {
  // Revoke server-side session if JTI is present
  try {
    const token = getAuthTokenFromRequest(req)
    if (token) {
      const decoded = verifyAuthToken(token)
      if (decoded.jti) {
        const { revokeSessionByJti } = require('./session.service')
        void revokeSessionByJti(decoded.jti).catch(() => {})
      }
    }
  } catch {
    // Token may already be expired/invalid — still clear cookie
  }

  clearAuthCookie(res)
  return res.json({ message: 'Logged out.' })
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req.user.userId)
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    return res.json(await buildSessionUserPayload(user))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ─── Active Sessions Management ────────────────────────────────────────────

router.get('/sessions', requireAuth, sessionListLimiter, async (req, res) => {
  try {
    const { getActiveSessions } = require('./session.service')
    const sessions = await getActiveSessions(req.user.userId)

    // Mark the current session so the frontend can badge it
    const currentJti = req.sessionJti || null
    const mapped = sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      deviceKind: s.deviceKind,
      ipAddress: s.ipAddress,
      country: s.country,
      region: s.region,
      city: s.city,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrent: s.jti === currentJti,
    }))

    return res.json({ sessions: mapped })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load sessions.', ERROR_CODES.INTERNAL)
  }
})

router.delete('/sessions/:sessionId', requireAuth, sessionRevokeLimiter, async (req, res) => {
  try {
    const { revokeSession } = require('./session.service')
    const revoked = await revokeSession(req.params.sessionId, req.user.userId)
    if (!revoked) return sendError(res, 404, 'Session not found.', ERROR_CODES.NOT_FOUND)

    return res.json({ message: 'Session revoked.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not revoke session.', ERROR_CODES.INTERNAL)
  }
})

// ─── Login Activity ───────────────────────────────────────────────────────
//
// Returns the last N login events for the current user. Powers the
// Security-tab "Login activity" list. Scoped to login.* eventType rows
// from SecurityEvent; metadata includes geo + riskScore + band.

router.get('/security/login-activity', requireAuth, loginActivityLimiter, async (req, res) => {
  try {
    const limitParam = parseInt(req.query.limit, 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 30

    const events = await prisma.securityEvent.findMany({
      where: {
        userId: req.user.userId,
        eventType: { in: ['login.success', 'login.challenge', 'login.blocked', 'login.notify'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
      },
    })

    const shaped = events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt,
      deviceLabel: e.metadata?.deviceLabel || null,
      deviceKind: e.metadata?.deviceKind || null,
      country: e.metadata?.country || null,
      region: e.metadata?.region || null,
      city: e.metadata?.city || null,
      riskScore: e.metadata?.riskScore ?? null,
      band: e.metadata?.band || 'normal',
      deviceKnown: e.metadata?.deviceKnown ?? null,
      sessionId: e.metadata?.sessionId || null,
    }))

    return res.json({ events: shaped })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load login activity.', ERROR_CODES.INTERNAL)
  }
})

router.delete('/sessions', requireAuth, sessionRevokeLimiter, async (req, res) => {
  try {
    if (!req.sessionJti) {
      return sendError(
        res,
        400,
        'Current session does not support device management. Please log out and log in again.',
        ERROR_CODES.BAD_REQUEST,
      )
    }
    const { revokeAllOtherSessions } = require('./session.service')
    await revokeAllOtherSessions(req.user.userId, req.sessionJti)

    return res.json({ message: 'All other sessions revoked.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not revoke sessions.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
