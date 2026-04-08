const { hashStoredSecret } = require('../authTokens')
const prisma = require('../prisma')

const {
  VERIFICATION_PURPOSE,
  VERIFICATION_MAX_SENDS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  VerificationError,
  createChallengeCode,
  createChallengeToken,
  getResendAvailableAt,
  clearExpiredChallenges,
  findChallengeByToken,
  refreshChallengeCode,
  getUserActiveChallenge,
} = require('./verificationStorage')

function assertResendAllowed(challenge) {
  if ((challenge.sendCount || 0) <= 0) {
    return
  }

  const resendAvailableAt = getResendAvailableAt(challenge.lastSentAt)
  if (challenge.sendCount >= VERIFICATION_MAX_SENDS) {
    throw new VerificationError(429, 'You have requested too many verification codes. Please start again.')
  }
  if (resendAvailableAt > new Date()) {
    throw new VerificationError(429, 'Please wait before requesting another verification code.')
  }
}

async function verifyChallengeCode(token, purpose, code, db = prisma) {
  const sanitizedCode = String(code || '').trim()
  if (!/^\d{6}$/.test(sanitizedCode)) {
    throw new VerificationError(400, 'Enter the 6-digit verification code.')
  }

  const challenge = await findChallengeByToken(token, purpose, db)
  if (challenge.verifiedAt) {
    return challenge
  }
  if (challenge.attemptCount >= VERIFICATION_MAX_ATTEMPTS) {
    await db.verificationChallenge.deleteMany({ where: { id: challenge.id } })
    throw new VerificationError(429, 'Too many incorrect codes. Please start again.')
  }

  if (challenge.codeHash !== hashStoredSecret(sanitizedCode)) {
    await db.verificationChallenge.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    })
    throw new VerificationError(400, 'Incorrect verification code.')
  }

  return db.verificationChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date() },
  })
}

async function createSignupChallenge({ username, email, passwordHash, accountType, payload }, db = prisma) {
  const normalizedUsername = String(username || '').trim()
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedUsername || !normalizedEmail || !passwordHash) {
    throw new VerificationError(400, 'Username, email, and password are required.')
  }

  await clearExpiredChallenges(db)
  await db.verificationChallenge.deleteMany({
    where: {
      purpose: VERIFICATION_PURPOSE.SIGNUP,
      OR: [
        { username: normalizedUsername },
        { email: normalizedEmail },
      ],
    },
  })

  const nextCode = createChallengeCode()
  const challenge = await db.verificationChallenge.create({
    data: {
      token: createChallengeToken(),
      purpose: VERIFICATION_PURPOSE.SIGNUP,
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      payload: {
        accountType: accountType || payload?.accountType || 'student',
        ...(payload && typeof payload === 'object' ? payload : {}),
      },
      codeHash: nextCode.codeHash,
      expiresAt: nextCode.expiresAt,
      lastSentAt: nextCode.lastSentAt,
    },
  })

  return { challenge, code: nextCode.code }
}

async function resendSignupChallenge(token, db = prisma) {
  const challenge = await findChallengeByToken(token, VERIFICATION_PURPOSE.SIGNUP, db)
  if (challenge.verifiedAt) {
    throw new VerificationError(400, 'This email is already verified. Continue to course selection.')
  }
  assertResendAllowed(challenge)
  return refreshChallengeCode(challenge.id, db)
}

async function createOrRefreshLoginChallenge({ user, email }, db = prisma) {
  await clearExpiredChallenges(db)

  const normalizedEmail = email ? String(email).trim().toLowerCase() : null
  const existing = await db.verificationChallenge.findFirst({
    where: {
      purpose: VERIFICATION_PURPOSE.LOGIN_EMAIL,
      userId: user.id,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!existing) {
    const nextCode = createChallengeCode()
    const challengeEmail = normalizedEmail || user.email || null
    const canSendImmediately = Boolean(challengeEmail)
    const challenge = await db.verificationChallenge.create({
      data: {
        token: createChallengeToken(),
        purpose: VERIFICATION_PURPOSE.LOGIN_EMAIL,
        userId: user.id,
        username: user.username,
        email: challengeEmail,
        codeHash: nextCode.codeHash,
        expiresAt: nextCode.expiresAt,
        lastSentAt: canSendImmediately
          ? nextCode.lastSentAt
          : new Date(Date.now() - VERIFICATION_RESEND_COOLDOWN_MS),
        sendCount: canSendImmediately ? 1 : 0,
      },
    })
    return { challenge, code: canSendImmediately ? nextCode.code : null, didSend: canSendImmediately }
  }

  if (normalizedEmail && normalizedEmail !== existing.email) {
    const nextCode = createChallengeCode()
    const challenge = await db.verificationChallenge.update({
      where: { id: existing.id },
      data: {
        email: normalizedEmail,
        codeHash: nextCode.codeHash,
        expiresAt: nextCode.expiresAt,
        lastSentAt: nextCode.lastSentAt,
        sendCount: 1,
        attemptCount: 0,
        verifiedAt: null,
      },
    })
    return { challenge, code: nextCode.code, didSend: true }
  }

  if (!existing.email) {
    return { challenge: existing, code: null, didSend: false }
  }

  try {
    assertResendAllowed(existing)
    const refreshed = await refreshChallengeCode(existing.id, db)
    return { challenge: refreshed.challenge, code: refreshed.code, didSend: true }
  } catch (error) {
    if (error instanceof VerificationError && error.statusCode === 429) {
      return { challenge: existing, code: null, didSend: false }
    }
    throw error
  }
}

async function sendOrRefreshLoginChallenge(token, email, db = prisma) {
  const challenge = await findChallengeByToken(token, VERIFICATION_PURPOSE.LOGIN_EMAIL, db)
  const normalizedEmail = email ? String(email).trim().toLowerCase() : challenge.email
  if (!normalizedEmail) {
    throw new VerificationError(400, 'Enter an email address before requesting a verification code.')
  }
  assertResendAllowed(challenge)

  const nextCode = createChallengeCode()
  const updatedChallenge = await db.verificationChallenge.update({
    where: { id: challenge.id },
    data: {
      email: normalizedEmail,
      codeHash: nextCode.codeHash,
      expiresAt: nextCode.expiresAt,
      lastSentAt: nextCode.lastSentAt,
      sendCount: { increment: 1 },
      attemptCount: 0,
      verifiedAt: null,
    },
  })

  return { challenge: updatedChallenge, code: nextCode.code }
}

async function createSettingsEmailChallenge({ user, email }, db = prisma) {
  await clearExpiredChallenges(db)
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const nextCode = createChallengeCode()

  await db.verificationChallenge.deleteMany({
    where: {
      purpose: VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      userId: user.id,
    },
  })

  const challenge = await db.verificationChallenge.create({
    data: {
      token: createChallengeToken(),
      purpose: VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      userId: user.id,
      username: user.username,
      email: normalizedEmail,
      codeHash: nextCode.codeHash,
      expiresAt: nextCode.expiresAt,
      lastSentAt: nextCode.lastSentAt,
    },
  })

  return { challenge, code: nextCode.code }
}

async function resendSettingsEmailChallenge(userId, db = prisma) {
  const challenge = await getUserActiveChallenge(userId, VERIFICATION_PURPOSE.SETTINGS_EMAIL, db)
  if (!challenge) {
    throw new VerificationError(400, 'No email verification is currently in progress.')
  }
  if (challenge.verifiedAt) {
    throw new VerificationError(400, 'This email is already verified.')
  }
  assertResendAllowed(challenge)
  return refreshChallengeCode(challenge.id, db)
}

module.exports = {
  assertResendAllowed,
  verifyChallengeCode,
  createSignupChallenge,
  resendSignupChallenge,
  createOrRefreshLoginChallenge,
  sendOrRefreshLoginChallenge,
  createSettingsEmailChallenge,
  resendSettingsEmailChallenge,
}
