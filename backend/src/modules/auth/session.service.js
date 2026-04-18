const crypto = require('crypto')
const prisma = require('../../lib/prisma')

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours — matches JWT

/**
 * Generate a cryptographically random JTI (JWT ID) for session tracking.
 */
function generateJti() {
  return crypto.randomUUID()
}

/**
 * Parse a user-agent string into a short human-readable device label.
 * Lightweight — no external dependency.
 */
function parseDeviceLabel(ua) {
  if (!ua) return 'Unknown device'

  let browser = 'Unknown browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'

  let os = 'Unknown OS'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Linux/i.test(ua)) os = 'Linux'
  else if (/CrOS/i.test(ua)) os = 'ChromeOS'

  return `${browser} on ${os}`
}

/**
 * Classify a user-agent into a coarse device type.
 * Returns one of: "laptop" | "desktop" | "mobile" | "tablet" | "watch" | "unknown".
 * Used by the sessions UI to pick the right device icon.
 *
 * We can't reliably distinguish desktop vs laptop from a UA alone, so all
 * non-mobile / non-tablet / non-watch Windows/Mac/Linux/CrOS UAs get "laptop"
 * as a sensible default. Callers can still surface the "Chrome on Windows"
 * deviceLabel alongside the icon.
 */
function deriveDeviceKind(ua) {
  if (!ua || typeof ua !== 'string') return 'unknown'
  if (/Apple Watch|Watch OS/i.test(ua)) return 'watch'
  if (/iPad/i.test(ua)) return 'tablet'
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet'
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile'
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'mobile'
  if (/Macintosh|Mac OS|Windows|Linux|CrOS/i.test(ua)) return 'laptop'
  return 'unknown'
}

/**
 * Create a new session row in the database.
 * Returns { jti } so the caller can embed it in the JWT payload.
 *
 * Optional fields `trustedDeviceId`, `country`, `region`, `city`, `riskScore`
 * are populated by the login controller once Phase 1b/2 are wired.
 * Omitting them keeps the column NULL and is fully supported.
 */
async function createSession({
  userId,
  userAgent,
  ipAddress,
  trustedDeviceId,
  country,
  region,
  city,
  riskScore,
}) {
  const jti = generateJti()
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)
  const deviceLabel = parseDeviceLabel(userAgent)
  const deviceKind = deriveDeviceKind(userAgent)

  const session = await prisma.session.create({
    data: {
      userId,
      jti,
      userAgent: userAgent ? userAgent.slice(0, 512) : null,
      ipAddress: ipAddress ? ipAddress.slice(0, 45) : null,
      deviceLabel: deviceLabel.slice(0, 100),
      deviceKind,
      country: country ? String(country).slice(0, 2) : null,
      region: region ? String(region).slice(0, 10) : null,
      city: city ? String(city).slice(0, 128) : null,
      riskScore: Number.isFinite(riskScore) ? riskScore : null,
      trustedDeviceId: trustedDeviceId || null,
      expiresAt,
    },
  })

  return { jti, sessionId: session.id }
}

/**
 * Validate that a session exists, is not revoked, and has not expired.
 * Returns the session row if valid, null otherwise.
 */
async function validateSession(jti) {
  if (!jti) return null

  const session = await prisma.session.findUnique({ where: { jti } })
  if (!session) return null
  if (session.revokedAt) return null
  if (session.expiresAt < new Date()) return null

  return session
}

/**
 * Touch the lastActiveAt timestamp on a session.
 * Fire-and-forget — callers should not await.
 */
async function touchSession(jti) {
  if (!jti) return
  await prisma.session.update({
    where: { jti },
    data: { lastActiveAt: new Date() },
  })
}

/**
 * Revoke a single session by its ID.
 * Only the owning user (or an admin) should call this.
 *
 * When the session is linked to a TrustedDevice, we also mark the device
 * revoked — the next login from that browser will be treated as a new
 * device by the risk-scoring layer.
 */
async function revokeSession(sessionId, userId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { trustedDevice: true },
  })
  if (!session || session.userId !== userId) return null
  if (session.revokedAt) return session // already revoked

  const now = new Date()
  const ops = [
    prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: now },
    }),
  ]
  if (session.trustedDevice && !session.trustedDevice.revokedAt) {
    ops.push(
      prisma.trustedDevice.update({
        where: { id: session.trustedDevice.id },
        data: { revokedAt: now },
      }),
    )
  }
  await prisma.$transaction(ops)

  return prisma.session.findUnique({ where: { id: sessionId } })
}

/**
 * Revoke a session by its JTI (used during logout).
 */
async function revokeSessionByJti(jti) {
  if (!jti) return
  try {
    await prisma.session.update({
      where: { jti },
      data: { revokedAt: new Date() },
    })
  } catch {
    // Session may not exist (e.g. pre-migration tokens) — graceful no-op
  }
}

/**
 * Revoke all sessions for a user except the current one.
 */
async function revokeAllOtherSessions(userId, currentJti) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      NOT: [{ jti: currentJti }],
    },
    data: { revokedAt: new Date() },
  })
}

/**
 * List active (non-revoked, non-expired) sessions for a user.
 */
async function getActiveSessions(userId) {
  return prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deviceLabel: true,
      deviceKind: true,
      ipAddress: true,
      country: true,
      region: true,
      city: true,
      lastActiveAt: true,
      createdAt: true,
      jti: true,
    },
    orderBy: { lastActiveAt: 'desc' },
  })
}

/**
 * Clean up expired sessions older than 7 days.
 * Designed to be called periodically (e.g., daily cron or on each login).
 */
async function cleanupExpiredSessions() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
    },
  })
}

module.exports = {
  createSession,
  validateSession,
  touchSession,
  revokeSession,
  revokeSessionByJti,
  revokeAllOtherSessions,
  getActiveSessions,
  cleanupExpiredSessions,
  parseDeviceLabel,
  deriveDeviceKind,
  generateJti,
}
