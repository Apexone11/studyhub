/**
 * Creates an in-app notification. Silently skips if actor is recipient.
 *
 * Priority levels:
 *   'high'   — in-app + email (moderation escalations, strikes, appeal submitted)
 *   'medium' — in-app only (default — case resolved, content restored, etc.)
 *   'low'    — in-app only (informational, routine)
 */
const VALID_PRIORITIES = ['high', 'medium', 'low']

async function createNotification(prisma, { userId, type, message, actorId, sheetId, linkPath, priority }) {
  if (userId === actorId) return // never notify yourself
  const safePriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium'
  try {
    const notif = await prisma.notification.create({
      data: {
        userId,
        type,
        message,
        priority: safePriority,
        actorId: actorId || null,
        sheetId: sheetId || null,
        linkPath: linkPath || null,
      }
    })

    /* Fire-and-forget: send email for high-priority notifications */
    if (safePriority === 'high') {
      void sendHighPriorityEmail(prisma, { userId, type, message, linkPath }).catch(() => {})
    }

    return notif
  } catch (err) {
    // Non-fatal — log and continue
    console.error('createNotification error:', err.message)
  }
}

/**
 * Sends an email for high-priority notifications.
 * Looks up the user's email; only sends if they have a verified email.
 */
async function sendHighPriorityEmail(prisma, { userId, type, message, linkPath }) {
  let deliverMail, getFromAddress, getPublicAppUrl, escapeHtml
  try {
    const transport = require('./emailTransport')
    deliverMail = transport.deliverMail
    getFromAddress = transport.getFromAddress
    getPublicAppUrl = transport.getPublicAppUrl
    escapeHtml = transport.escapeHtml
  } catch {
    return // email not configured
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, username: true },
  })
  if (!user?.email || !user.emailVerified) return

  const appUrl = getPublicAppUrl()
  const actionUrl = linkPath ? `${appUrl}${linkPath}` : appUrl
  const typeLabel = type === 'moderation' ? 'Moderation Notice' : 'Important Update'

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${escapeHtml(typeLabel)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#0f172a;padding:28px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:bold;">StudyHub</span>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${escapeHtml(typeLabel)}</h2>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
            Hi ${escapeHtml(user.username)}, ${escapeHtml(message)}
          </p>
          <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
            View Details
          </a>
        </td></tr>
        <tr><td style="padding:16px 40px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">You received this because of a high-priority event on your StudyHub account.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await deliverMail({
    from: `"StudyHub" <${getFromAddress()}>`,
    to: user.email,
    subject: `StudyHub — ${typeLabel}`,
    text: `${typeLabel}: ${message}\n\nView details: ${actionUrl}`,
    html,
  }, 'high-priority-notification')
}

module.exports = { createNotification, VALID_PRIORITIES }
