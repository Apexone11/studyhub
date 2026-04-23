/**
 * revokeLinkTokens.js — signed one-use tokens for "This wasn't me" email CTAs.
 *
 * Piggybacks on JWT_SECRET with a distinct `aud` claim so it can never be
 * confused with an auth session token. Tokens embed the userId + sessionId
 * + trustedDeviceId, expire in 24h, and are single-use (we mark the target
 * session revoked on use, which naturally prevents replay — a revoked
 * session can't be revoked again).
 */

const jwt = require('jsonwebtoken')

const AUDIENCE = 'studyhub-revoke-link'
const TTL_SECONDS = 24 * 60 * 60

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }
  return process.env.JWT_SECRET
}

/**
 * Sign a revoke-link token. Callers embed the returned string in a URL
 * like: https://site/api/auth/revoke-link/<token>
 */
function signRevokeToken({ userId, sessionId, trustedDeviceId }) {
  if (!userId || !sessionId) {
    throw new Error('signRevokeToken requires userId + sessionId')
  }
  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      tdid: trustedDeviceId || null,
    },
    getSecret(),
    {
      audience: AUDIENCE,
      expiresIn: TTL_SECONDS,
    },
  )
}

/**
 * Verify a token. Throws via jsonwebtoken on bad signature / expiry;
 * returns the decoded payload on success.
 */
function verifyRevokeToken(token) {
  return jwt.verify(token, getSecret(), { audience: AUDIENCE })
}

module.exports = { signRevokeToken, verifyRevokeToken, AUDIENCE }
