const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const { captureError } = require('../../monitoring/sentry')
const { issueAuthenticatedSession } = require('../auth/auth.service')
const {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
} = require('../../lib/webauthn/webauthn')
const prisma = require('../../lib/prisma')
const { webauthnLimiter } = require('../../lib/rateLimiters')
const originAllowlist = require('../../middleware/originAllowlist')

const router = express.Router()

// CLAUDE.md A11 — passkey routes mutate auth state (POST /authenticate/verify
// issues a full session; POST /register/verify persists a credential; DELETE
// /credentials/:id removes an admin passkey) but this module is mounted
// separately from /api/auth, so it must opt into the fail-closed Origin
// allowlist itself. Same allowlist /api/auth already enforces (so the native
// client, which passes /api/auth at login, is unaffected). Short-circuits
// GET/HEAD/OPTIONS, so GET /credentials is untouched.
router.use(originAllowlist())

// ── Registration (admin-only, requires auth) ────────────────────────────

// POST /api/webauthn/register/options
router.post('/register/options', webauthnLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const options = generateRegistrationOptions(user)
    res.json(options)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// POST /api/webauthn/register/verify
router.post('/register/verify', webauthnLimiter, requireAuth, requireAdmin, async (req, res) => {
  const { id, rawId, type, response: credentialResponse, name } = req.body || {}

  if (!id || !rawId || type !== 'public-key' || !credentialResponse) {
    return res.status(400).json({ error: 'Invalid credential payload.' })
  }

  try {
    const result = verifyRegistration(
      { id, rawId, type, response: credentialResponse, transports: req.body.transports || [] },
      req.user.userId,
    )

    if (!result.verified) {
      return res.status(400).json({ error: result.error || 'Registration verification failed.' })
    }

    const passKeyName =
      typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'Passkey'

    const credential = await prisma.webAuthnCredential.create({
      data: {
        userId: req.user.userId,
        credentialId: result.credentialId,
        publicKey: result.publicKey,
        counter: result.counter,
        deviceType: result.deviceType || null,
        backedUp: result.backedUp || false,
        transports: Array.isArray(result.transports) ? result.transports.join(',') : null,
        name: passKeyName,
      },
      select: {
        id: true,
        credentialId: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
      },
    })

    res.status(201).json({
      message: 'Passkey registered successfully.',
      credential,
    })
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'This passkey is already registered.' })
    }
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── Authentication (public — passkey login) ─────────────────────────────

// POST /api/webauthn/authenticate/options
router.post('/authenticate/options', webauthnLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, role: true },
    })

    if (!user || user.role !== 'admin') {
      // Do not reveal whether the user exists — return a generic error
      return res
        .status(400)
        .json({ error: 'Passkey authentication is not available for this account.' })
    }

    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    })

    if (credentials.length === 0) {
      return res
        .status(400)
        .json({ error: 'Passkey authentication is not available for this account.' })
    }

    const options = generateAuthenticationOptions(user.id, credentials)
    res.json(options)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// POST /api/webauthn/authenticate/verify
router.post('/authenticate/verify', webauthnLimiter, async (req, res) => {
  const { id, rawId, type, response: credentialResponse, username } = req.body || {}

  if (!id || !rawId || type !== 'public-key' || !credentialResponse || !username) {
    return res.status(400).json({ error: 'Invalid authentication payload.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: { id: true, username: true, role: true },
    })

    if (!user || user.role !== 'admin') {
      return res.status(401).json({ error: 'Authentication failed.' })
    }

    const storedCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: id },
      select: { id: true, userId: true, publicKey: true, counter: true },
    })

    if (!storedCredential || storedCredential.userId !== user.id) {
      return res.status(401).json({ error: 'Authentication failed.' })
    }

    const result = verifyAuthentication(
      { id, rawId, type, response: credentialResponse },
      storedCredential,
      user.id,
    )

    if (!result.verified) {
      return res.status(401).json({ error: result.error || 'Authentication failed.' })
    }

    // Update counter + lastUsedAt. lastUsedAt is the audit signal the
    // admin portal renders so the founder can spot a passkey that
    // hasn't been used in months and retire it (wave-12.11).
    await prisma.webAuthnCredential.update({
      where: { id: storedCredential.id },
      data: { counter: result.newCounter, lastUsedAt: new Date() },
    })

    // Issue session via the canonical login helper — mirrors
    // login.challenge.controller + login.recovery.controller. The previous
    // hand-rolled `signAuthToken + setAuthCookie` path bypassed Session
    // row creation, so the JWT carried no `jti` and requireAuth left
    // `req.sessionJti` undefined. With the wave-12.11 fail-closed
    // `requireRecentMfa` middleware, every passkey-authed admin then hit
    // `MFA_STEP_UP_REQUIRED { reason: 'no_session' }` on PATCH role /
    // trust-level / mfa, DELETE user, and the Stripe sync route, and the
    // step-up /verify endpoint 401'd because there was no session row to
    // refresh — admins were locked out of every gated route via passkey
    // login (wave-12.15 fix from a Codex P1 finding).
    //
    // Passkey is an explicit AAL2 factor per NIST 800-63B ("something you
    // have"), so passing `mfaVerified: true` stamps `Session.mfaVerifiedAt`
    // at creation and `requireRecentMfa` permits the next 15 minutes
    // without a separate step-up prompt.
    const authenticatedUser = await issueAuthenticatedSession(res, user.id, req, null, {
      mfaVerified: true,
    })

    res.json({
      message: 'Login successful!',
      user: authenticatedUser,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── Credential management (admin-only, requires auth) ───────────────────

// GET /api/webauthn/credentials
router.get('/credentials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: req.user.userId },
      select: {
        id: true,
        credentialId: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ credentials })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// DELETE /api/webauthn/credentials/:id
router.delete('/credentials/:id', requireAuth, requireAdmin, async (req, res) => {
  const credentialId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(credentialId)) {
    return res.status(400).json({ error: 'Credential id must be an integer.' })
  }

  try {
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { id: credentialId },
      select: { id: true, userId: true },
    })

    if (!credential) {
      return res.status(404).json({ error: 'Passkey not found.' })
    }
    if (credential.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Not your passkey.' })
    }

    await prisma.webAuthnCredential.delete({ where: { id: credentialId } })
    res.json({ message: 'Passkey removed.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
