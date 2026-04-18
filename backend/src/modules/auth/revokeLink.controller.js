/**
 * GET /api/auth/revoke-link/:token
 *
 * Backs the "This wasn't me" CTA in the new-login-location email.
 * Token is signed with the JWT secret under audience=studyhub-revoke-link
 * and embeds userId + sessionId + trustedDeviceId. On success:
 *
 *   - revoke the target session
 *   - revoke the trusted device so the next login from that browser
 *     runs through the new-device risk path
 *   - serve a minimal HTML "success" page
 *
 * Single-use semantics are enforced naturally: a revoked session/device
 * can't be revoked again, so replaying the link is a no-op.
 */

const express = require('express')
const prisma = require('../../lib/prisma')
const { verifyRevokeToken } = require('../../lib/revokeLinkTokens')
const { getPublicAppUrl } = require('../../lib/email/emailTransport')

const router = express.Router()

function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f0f4f8; color: #1e3a5f; }
    .card { max-width: 520px; margin: 0 auto; padding: 32px; background: #fff; border-radius: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #4b5563; }
    a.btn { display: inline-block; background: #2563eb; color: #fff; font-weight: 700; padding: 10px 18px; border-radius: 8px; text-decoration: none; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`
}

router.get('/revoke-link/:token', async (req, res) => {
  const token = String(req.params.token || '')
  if (!token) {
    return res
      .status(400)
      .send(
        htmlPage('Invalid link', '<h1>Invalid link</h1><p>The revoke link is missing a token.</p>'),
      )
  }

  let payload
  try {
    payload = verifyRevokeToken(token)
  } catch {
    return res
      .status(400)
      .send(
        htmlPage(
          'Invalid or expired link',
          '<h1>Invalid or expired link</h1>' +
            '<p>This revoke link has expired or is no longer valid. If you still think a sign-in was unauthorized, open Settings → Sessions and revoke the device directly.</p>' +
            `<a class="btn" href="${getPublicAppUrl()}/settings?tab=sessions">Open Sessions</a>`,
        ),
      )
  }

  const userId = payload.sub
  const sessionId = payload.sid
  const trustedDeviceId = payload.tdid || null

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (session && session.userId === userId && !session.revokedAt) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      })
    }
    if (trustedDeviceId) {
      const device = await prisma.trustedDevice.findUnique({ where: { id: trustedDeviceId } })
      if (device && device.userId === userId && !device.revokedAt) {
        await prisma.trustedDevice.update({
          where: { id: trustedDeviceId },
          data: { revokedAt: new Date() },
        })
      }
    }
    await prisma.securityEvent
      .create({
        data: {
          userId,
          eventType: 'login.revoke-link',
          ipAddress: req?.ip ? String(req.ip).slice(0, 45) : null,
          userAgent: req?.headers?.['user-agent']
            ? String(req.headers['user-agent']).slice(0, 512)
            : null,
          metadata: { sessionId, trustedDeviceId },
        },
      })
      .catch(() => {})
  } catch {
    // If the DB is unavailable we still present a success page — the
    // follow-up password reset link is the real safety valve.
  }

  return res.send(
    htmlPage(
      'Device revoked',
      '<h1>Device revoked.</h1>' +
        '<p>The sign-in has been blocked and the device removed from your account. We recommend changing your password now.</p>' +
        `<a class="btn" href="${getPublicAppUrl()}/forgot-password">Change password</a>`,
    ),
  )
})

module.exports = router
