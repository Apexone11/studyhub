const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const {
  clearAuthCookie,
  getAuthTokenFromRequest,
  verifyAuthToken,
} = require('../../lib/authTokens')
const requireAuth = require('../../middleware/auth')
const { logoutLimiter } = require('./auth.constants')
const { getAuthenticatedUser, buildSessionUserPayload } = require('./auth.service')

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
    if (!user) return res.status(404).json({ error: 'User not found.' })

    return res.json(await buildSessionUserPayload(user))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

// ─── Active Sessions Management ────────────────────────────────────────────

router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const { getActiveSessions } = require('./session.service')
    const sessions = await getActiveSessions(req.user.userId)

    // Mark the current session so the frontend can badge it
    const currentJti = req.sessionJti || null
    const mapped = sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      ipAddress: s.ipAddress,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrent: s.jti === currentJti,
    }))

    return res.json({ sessions: mapped })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Could not load sessions.' })
  }
})

router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const { revokeSession } = require('./session.service')
    const revoked = await revokeSession(req.params.sessionId, req.user.userId)
    if (!revoked) return res.status(404).json({ error: 'Session not found.' })

    return res.json({ message: 'Session revoked.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Could not revoke session.' })
  }
})

router.delete('/sessions', requireAuth, async (req, res) => {
  try {
    if (!req.sessionJti) {
      return res
        .status(400)
        .json({
          error:
            'Current session does not support device management. Please log out and log in again.',
        })
    }
    const { revokeAllOtherSessions } = require('./session.service')
    await revokeAllOtherSessions(req.user.userId, req.sessionJti)

    return res.json({ message: 'All other sessions revoked.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Could not revoke sessions.' })
  }
})

module.exports = router
