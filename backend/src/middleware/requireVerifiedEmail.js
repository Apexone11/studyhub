/**
 * Middleware that blocks requests from users whose email is not verified.
 * Returns 403 with a clear error code so the frontend can show the right UX.
 *
 * Use on routes that should be soft-gated: sheet creation, commenting,
 * email changes, etc.
 *
 * Requires requireAuth to run first (req.user.userId must exist).
 */
const prisma = require('../lib/prisma')

async function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { emailVerified: true },
    })

    if (!user || !user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email address before using this feature.',
        code: 'EMAIL_NOT_VERIFIED',
      })
    }

    next()
  } catch {
    // Fail open on DB errors — don't block users due to transient issues
    next()
  }
}

module.exports = requireVerifiedEmail
