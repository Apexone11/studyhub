/**
 * Middleware that blocks requests from users whose email is not verified.
 * Returns 403 with a clear error code so the frontend can show the right UX.
 *
 * Rule: trusted = emailVerified. No grace period — verify your email to
 * unlock write-oriented features (sheets, comments, contributions, notes).
 *
 * Requires requireAuth to run first (req.user.userId must exist).
 */
const prisma = require('../lib/prisma')
const { captureError } = require('../monitoring/sentry')
const { ERROR_CODES, sendError } = require('./errorEnvelope')

async function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { emailVerified: true },
    })

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    if (user.emailVerified) {
      return next()
    }

    return res.status(403).json({
      error: 'Please verify your email address to continue using this feature. Check your inbox or resend from Settings.',
      code: 'EMAIL_NOT_VERIFIED',
    })
  } catch (error) {
    captureError(error, {
      middleware: 'requireVerifiedEmail',
      route: req.originalUrl,
      method: req.method,
      userId: req.user?.userId || null,
    })
    return sendError(
      res,
      503,
      'We could not verify your email status right now. Please try again shortly.',
      ERROR_CODES.INTERNAL,
    )
  }
}

module.exports = requireVerifiedEmail
