const crypto = require('crypto')
const { hashStoredSecret } = require('./authTokens')
const { generateSixDigitCode, maskEmailAddress } = require('./verificationCodes')
const prisma = require('./prisma')

const VERIFICATION_PURPOSE = {
  SIGNUP: 'signup',
  LOGIN_EMAIL: 'login-email',
  SETTINGS_EMAIL: 'settings-email',
}

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000
const VERIFICATION_MAX_SENDS = 5
const VERIFICATION_MAX_ATTEMPTS = 10

class VerificationError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function createChallengeCode() {
  const code = generateSixDigitCode()
  return {
    code,
    codeHash: hashStoredSecret(code),
    expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    lastSentAt: new Date(),
  }
}

function createChallengeToken() {
  return crypto.randomBytes(32).toString('hex')
}

function getResendAvailableAt(lastSentAt) {
  return new Date(new Date(lastSentAt).getTime() + VERIFICATION_RESEND_COOLDOWN_MS)
}

function mapChallengeForClient(challenge) {
  return {
    verificationToken: challenge.token,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: getResendAvailableAt(challenge.lastSentAt),
    deliveryHint: challenge.email ? maskEmailAddress(challenge.email) : '',
    emailRequired: !challenge.email,
    email: challenge.email || null,
  }
}

async function clearExpiredChallenges(db = prisma) {
  await db.verificationChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { verifiedAt: { not: null }, updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  })
}

async function findChallengeByToken(token, purpose, db = prisma) {
  if (!token) {
    throw new VerificationError(400, 'Verification token is required.')
  }

  const challenge = await db.verificationChallenge.findFirst({
    where: { token, purpose },
  })

  if (!challenge) {
    throw new VerificationError(400, 'Verification session is invalid or has expired.')
  }

  if (challenge.expiresAt < new Date()) {
    await db.verificationChallenge.deleteMany({ where: { id: challenge.id } })
    throw new VerificationError(400, 'Verification session is invalid or has expired.')
  }

  return challenge
}

async function refreshChallengeCode(challengeId, db = prisma) {
  const nextCode = createChallengeCode()
  const challenge = await db.verificationChallenge.update({
    where: { id: challengeId },
    data: {
      codeHash: nextCode.codeHash,
      expiresAt: nextCode.expiresAt,
      lastSentAt: nextCode.lastSentAt,
      sendCount: { increment: 1 },
      attemptCount: 0,
      verifiedAt: null,
    },
  })

  return { challenge, code: nextCode.code }
}

async function getUserActiveChallenge(userId, purpose, db = prisma) {
  await clearExpiredChallenges(db)
  const challenge = await db.verificationChallenge.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: 'desc' },
  })
  if (!challenge) return null
  if (challenge.expiresAt < new Date()) {
    await db.verificationChallenge.deleteMany({ where: { id: challenge.id } })
    return null
  }
  return challenge
}

async function consumeChallenge(id, db = prisma) {
  await db.verificationChallenge.deleteMany({ where: { id } })
}

module.exports = {
  VERIFICATION_PURPOSE,
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  VERIFICATION_MAX_SENDS,
  VERIFICATION_MAX_ATTEMPTS,
  VerificationError,
  createChallengeCode,
  createChallengeToken,
  getResendAvailableAt,
  mapChallengeForClient,
  clearExpiredChallenges,
  findChallengeByToken,
  refreshChallengeCode,
  getUserActiveChallenge,
  consumeChallenge,
}
