/**
 * Middleware that blocks requests from users whose email is not verified.
 * Returns 403 with a clear error code so the frontend can show the right UX.
 *
 * Grace period: new accounts get GRACE_PERIOD_DAYS days before verification
 * is required. After the grace window closes, unverified users are blocked
 * from write-oriented features (comments, uploads, contributions, notes).
 *
 * Requires requireAuth to run first (req.user.userId must exist).
 */
const prisma = require('../lib/prisma')

const GRACE_PERIOD_DAYS = 3
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000

async function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { emailVerified: true, createdAt: true },
    })

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    if (user.emailVerified) {
      return next()
    }

    // Allow unverified users within the grace period
    const graceEnd = new Date(user.createdAt.getTime() + GRACE_PERIOD_MS)
    if (Date.now() < graceEnd.getTime()) {
      return next()
    }

    return res.status(403).json({
      error: 'Please verify your email address to continue using this feature. Check your inbox or resend from Settings.',
      code: 'EMAIL_NOT_VERIFIED',
      gracePeriodDays: GRACE_PERIOD_DAYS,
    })
  } catch {
    // Fail open on DB errors — don't block users due to transient issues
    next()
  }
}

module.exports = requireVerifiedEmail
