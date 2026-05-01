const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { checkAndPromoteTrust } = require('../../lib/trustGate')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { loginLimiter } = require('./auth.constants')
const { issueAuthenticatedSession, evaluateLoginRisk, handleAuthError } = require('./auth.service')
const { MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS } = require('../../lib/constants')

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    return sendError(res, 400, 'Please fill in both fields.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return sendError(res, 401, 'Incorrect username or password.', ERROR_CODES.UNAUTHORIZED, {
        showForgot: false,
      })
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000)
      return sendError(
        res,
        429,
        `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        ERROR_CODES.RATE_LIMITED,
        {
          locked: true,
          minutesLeft,
          showForgot: true,
        },
      )
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      const newFailedAttempts = user.failedAttempts + 1
      const shouldLock = newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
      const failedAt = new Date()
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newFailedAttempts,
          lastFailedLoginAt: failedAt,
          lockedUntil: shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_MS) : null,
        },
      })

      if (shouldLock) {
        return sendError(
          res,
          429,
          'Too many failed attempts. Account locked for 15 minutes.',
          ERROR_CODES.RATE_LIMITED,
          {
            locked: true,
            minutesLeft: 15,
            showForgot: true,
          },
        )
      }

      const attemptsLeft = MAX_FAILED_LOGIN_ATTEMPTS - newFailedAttempts
      return sendError(
        res,
        401,
        `Incorrect username or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        ERROR_CODES.UNAUTHORIZED,
        {
          showForgot: newFailedAttempts >= 1,
        },
      )
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
    })

    /* Email verification is no longer required at login time — moved to
     * the trusted-device flow. See trustedDevice.service.js for the
     * current verification path. */

    // Admin MFA enforcement (L2.14). When the flag is on AND this user
    // has `mfaRequired = true`, force the path through 2FA on every
    // login regardless of risk band. Admins with mfaRequired but no
    // 2FA configured get a 403 telling the frontend to route to
    // /settings/security/setup-2fa first. Fail-CLOSED: any error
    // reading the flag treats enforcement as OFF (matches the rest of
    // the auth flow's "never lock out the founder" stance — admin MFA
    // can be relaxed via the flag while we investigate).
    let adminMfaEnforced = false
    try {
      const flag = await prisma.featureFlag.findUnique({
        where: { name: 'flag_admin_mfa_required' },
        select: { enabled: true },
      })
      adminMfaEnforced = Boolean(flag && flag.enabled === true)
    } catch {
      adminMfaEnforced = false
    }
    // Path A: enforced admin without 2FA configured — block session,
    // tell the frontend to send the user to setup.
    if (adminMfaEnforced && user.role === 'admin' && user.mfaRequired && !user.twoFaEnabled) {
      return sendError(
        res,
        403,
        'Admin accounts require 2FA. Set it up in Settings → Security to continue.',
        ERROR_CODES.FORBIDDEN,
        { code: 'MFA_SETUP_REQUIRED', setupPath: '/settings/security/setup-2fa' },
      )
    }
    // Path B (handled below): enforced admin WITH 2FA configured — the
    // risk evaluation runs normally, then we force the challenge band
    // so the OTP / recovery flow runs even when risk would have allowed
    // a session. The handleChallengeBand call short-circuits with a 401
    // carrying the challengeId; the user completes the challenge via
    // /api/auth/login/challenge or /api/auth/login/recovery-code.

    // Evaluate device + geo + risk BEFORE issuing a session. Lets us route
    // high-risk attempts (band=challenge, score >= 60) through an email
    // step-up code rather than silently handing out a cookie.
    const risk = await evaluateLoginRisk(user.id, req, res)

    // Admin MFA force-challenge: override the risk band when admin MFA
    // is enforced (computed above). Done after evaluateLoginRisk so the
    // same risk + device context flows into the challenge.
    if (adminMfaEnforced && user.role === 'admin' && user.mfaRequired && user.twoFaEnabled) {
      risk.riskResult.band = 'challenge'
    }

    if (risk.riskResult.band === 'challenge') {
      const handled = await handleChallengeBand(res, user, risk)
      if (handled) return handled
      // Challenge infra failed (e.g. no email on file or migration missing);
      // fall through to a normal session issue so we don't lock the user out.
    }

    const authenticatedUser = await issueAuthenticatedSession(res, user.id, req, risk)

    // "notify" band (30-59): session issued normally, but fire-and-forget an
    // alert email so the user can revoke if this wasn't them.
    if (risk.riskResult.band === 'notify' && authenticatedUser.sessionId) {
      void sendNotifyEmail(user, authenticatedUser.sessionId, risk).catch(() => {})
    }

    void checkAndPromoteTrust(user.id)
    return res.json({
      message: 'Login successful!',
      user: authenticatedUser,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

/**
 * High-risk login (score >= 60). Create a one-time 6-digit challenge, email
 * it to the verified address, and respond with a challengeId that the client
 * redeems via POST /api/auth/login/challenge.
 */
async function handleChallengeBand(res, user, risk) {
  if (!user.email) {
    // No email on file — can't step up. Fall back to normal issue rather than
    // blocking the user out of their own account. The risk is still logged.
    return null
  }
  try {
    const { createChallenge } = require('./loginChallenge.service')
    const { sendLoginChallengeCode } = require('../../lib/email/emailTemplates')
    const { id, code } = await createChallenge({
      userId: user.id,
      pendingDeviceId: risk.deviceId || 'unknown',
      ipAddress: risk.ipAddress,
      userAgent: risk.userAgent,
    })
    void sendLoginChallengeCode(user.email, user.username || 'there', code, {
      city: risk.geo?.city,
      region: risk.geo?.region,
      country: risk.geo?.country,
      ipAddress: risk.ipAddress,
    }).catch(() => {})

    // Log the event so it shows up in Login activity even though no session
    // was issued.
    void prisma.securityEvent
      .create({
        data: {
          userId: user.id,
          eventType: 'login.challenge',
          ipAddress: risk.ipAddress ? String(risk.ipAddress).slice(0, 45) : null,
          userAgent: risk.userAgent ? String(risk.userAgent).slice(0, 512) : null,
          metadata: {
            country: risk.geo?.country || null,
            region: risk.geo?.region || null,
            city: risk.geo?.city || null,
            riskScore: risk.riskResult.score,
            band: 'challenge',
            signals: risk.riskResult.signals,
            challengeId: id,
          },
        },
      })
      .catch(() => {})

    return res.status(200).json({
      status: 'challenge',
      challengeId: id,
      message: 'For your security, please enter the code we just emailed you.',
    })
  } catch {
    // If challenge infra fails (e.g. migration not deployed), fall through
    // to a normal session rather than locking the user out.
    return null
  }
}

async function sendNotifyEmail(user, sessionId, risk) {
  if (!user.email) return
  const { sendNewLoginLocation } = require('../../lib/email/emailTemplates')
  const { signRevokeToken } = require('../../lib/revokeLinkTokens')
  const { getPublicAppUrl } = require('../../lib/email/emailTransport')
  let revokeUrl = null
  try {
    const token = signRevokeToken({
      userId: user.id,
      sessionId,
      trustedDeviceId: risk.trustedDeviceId || null,
    })
    revokeUrl = `${getPublicAppUrl()}/api/auth/revoke-link/${token}`
  } catch {
    revokeUrl = null
  }
  const resetUrl = `${getPublicAppUrl()}/forgot-password`
  const { parseDeviceLabel } = require('./session.service')
  await sendNewLoginLocation(user.email, user.username || 'there', {
    deviceLabel: parseDeviceLabel(risk.userAgent),
    city: risk.geo?.city,
    region: risk.geo?.region,
    country: risk.geo?.country,
    ipAddress: risk.ipAddress,
    when: new Date(),
    revokeUrl,
    resetUrl,
  })
}

module.exports = router
