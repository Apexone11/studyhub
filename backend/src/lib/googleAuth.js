const { OAuth2Client } = require('google-auth-library')
const prisma = require('./prisma')

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''

function getClient() {
  if (!GOOGLE_CLIENT_ID) return null
  return new OAuth2Client(GOOGLE_CLIENT_ID)
}

async function verifyGoogleIdToken(idToken) {
  const client = getClient()
  if (!client) throw new Error('Google OAuth is not configured.')

  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  })

  const payload = ticket.getPayload()
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google token payload.')
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || '',
    picture: payload.picture || '',
    emailVerified: Boolean(payload.email_verified),
  }
}

async function findUserByGoogleId(googleId) {
  return prisma.user.findUnique({
    where: { googleId },
  })
}

async function findUserByEmail(email) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase() },
  })
}

async function linkGoogleToUser(userId, googleId) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      googleId,
      authProvider: 'both',
    },
  })
}

async function unlinkGoogleFromUser(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      googleId: null,
      authProvider: 'local',
    },
  })
}

function isGoogleOAuthEnabled() {
  return Boolean(GOOGLE_CLIENT_ID)
}

module.exports = {
  verifyGoogleIdToken,
  findUserByGoogleId,
  findUserByEmail,
  linkGoogleToUser,
  unlinkGoogleFromUser,
  isGoogleOAuthEnabled,
}
