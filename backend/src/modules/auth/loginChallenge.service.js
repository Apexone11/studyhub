/**
 * loginChallenge.service.js — email-code step-up challenge.
 *
 * Created when risk-scoring classifies a login into the "challenge" band.
 * The user must enter a 6-digit code (emailed to their verified address)
 * before a session cookie is issued.
 *
 * - Codes are 6 random digits, hashed with SHA-256 before storage.
 * - TTL 15 minutes.
 * - Max 3 verify attempts per challenge row. The 3rd wrong attempt
 *   causes `verifyChallenge` to return locked=true and stops accepting
 *   codes against THIS challenge row. A new login attempt can mint a
 *   fresh challenge; wiring a per-user lockout on top is a separate
 *   follow-up (see docs/internal/security/roadmap.md if/when we add
 *   that layer). Do not infer from this comment that User.lockedUntil
 *   is updated here — this service never writes it.
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
    // Atomic `{ increment: 1 }` instead of `attempts + 1` so two parallel
    // wrong submissions can't race and effectively grant one another an
    // extra attempt. Lock decision is based on the post-update value.
    const updated = await prisma.loginChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    })
    return {
      ok: false,
      reason: updated.attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong',
      remaining: Math.max(0, MAX_ATTEMPTS - updated.attempts),
    }
  }

  // Atomic single-use redemption. A conditional updateMany gates on
  // the same guards we already checked above; if a parallel request
  // won the race and consumed the row first, this update's count is 0
  // and we re-classify the outcome by re-reading the current row. Do
  // NOT set consumedAt with a plain `update` — two parallel correct
  // submissions could both pass the findUnique check above and both
  // call update, which would issue two sessions from one code.
  const consumeAt = new Date()
  const claimed = await prisma.loginChallenge.updateMany({
    where: {
      id,
      consumedAt: null,
      expiresAt: { gte: consumeAt },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: { consumedAt: consumeAt },
  })
  if (claimed.count !== 1) {
    const current = await prisma.loginChallenge.findUnique({ where: { id } })
    if (!current) return { ok: false, reason: 'not_found', remaining: 0 }
    if (current.consumedAt) return { ok: false, reason: 'consumed', remaining: 0 }
    if (current.expiresAt < consumeAt) return { ok: false, reason: 'expired', remaining: 0 }
    if (current.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked', remaining: 0 }
    // Fell through every known reason — treat as already consumed to
    // stay conservative. The lost-race path is functionally the same
    // as a consumed row from the caller's perspective.
    return { ok: false, reason: 'consumed', remaining: 0 }
  }
  const consumed = await prisma.loginChallenge.findUnique({ where: { id } })
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
