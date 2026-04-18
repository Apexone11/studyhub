/**
 * loginChallenge.service.js — email-code step-up challenge.
 *
 * Created when risk-scoring classifies a login into the "challenge" band.
 * The user must enter a 6-digit code (emailed to their verified address)
 * before a session cookie is issued.
 *
 * - Codes are 6 random digits, hashed with SHA-256 before storage.
 * - TTL 15 minutes.
 * - Max 3 verify attempts; the 3rd wrong attempt locks the challenge and
 *   arms the existing per-user lockedUntil (15 min) as a secondary gate.
 * - Challenge rows are single-use: consumedAt is set on success.
 */

const crypto = require('crypto')
const prisma = require('../../lib/prisma')

const CHALLENGE_TTL_MS = 15 * 60 * 1000
const CODE_LENGTH = 6
const MAX_ATTEMPTS = 3

function randomCode() {
  // Uniformly distributed 6-digit code. Node < 21 doesn't have randomInt for BigInt,
  // but 6 digits fits well within a safe integer.
  const n = crypto.randomInt(0, 10 ** CODE_LENGTH)
  return String(n).padStart(CODE_LENGTH, '0')
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex')
}

async function createChallenge({ userId, pendingDeviceId, ipAddress, userAgent }) {
  if (!userId || !pendingDeviceId) {
    throw new Error('createChallenge requires userId + pendingDeviceId')
  }
  const code = randomCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)

  const challenge = await prisma.loginChallenge.create({
    data: {
      userId,
      pendingDeviceId,
      codeHash,
      expiresAt,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    },
  })
  return { id: challenge.id, code } // code is returned ONLY here; never exposed via API
}

/**
 * Verify a code against a challenge. Returns:
 *   { ok: true,  challenge }
 *   { ok: false, reason: 'not_found' | 'expired' | 'consumed' | 'locked' | 'wrong', remaining }
 */
async function verifyChallenge({ id, code }) {
  if (!id || !code) return { ok: false, reason: 'not_found', remaining: 0 }

  const challenge = await prisma.loginChallenge.findUnique({ where: { id } })
  if (!challenge) return { ok: false, reason: 'not_found', remaining: 0 }
  if (challenge.consumedAt) return { ok: false, reason: 'consumed', remaining: 0 }
  if (challenge.expiresAt < new Date()) return { ok: false, reason: 'expired', remaining: 0 }
  if (challenge.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked', remaining: 0 }

  const provided = hashCode(String(code).trim())
  if (provided !== challenge.codeHash) {
    const updated = await prisma.loginChallenge.update({
      where: { id },
      data: { attempts: challenge.attempts + 1 },
    })
    return {
      ok: false,
      reason: updated.attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong',
      remaining: Math.max(0, MAX_ATTEMPTS - updated.attempts),
    }
  }

  const consumed = await prisma.loginChallenge.update({
    where: { id },
    data: { consumedAt: new Date() },
  })
  return { ok: true, challenge: consumed }
}

/**
 * Delete challenge rows older than 24h. Cheap cleanup; safe to run on a cron
 * or inline after successful logins.
 */
async function sweepExpired() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await prisma.loginChallenge.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
  })
}

module.exports = {
  createChallenge,
  verifyChallenge,
  sweepExpired,
  MAX_ATTEMPTS,
  CHALLENGE_TTL_MS,
}
