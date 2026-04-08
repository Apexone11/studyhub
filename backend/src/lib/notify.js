/**
 * Creates an in-app notification. Silently skips if actor is recipient.
 *
 * Priority levels:
 *   'high'   — in-app + email (moderation escalations, strikes, appeal submitted)
 *   'medium' — in-app only (default — case resolved, content restored, etc.)
 *   'low'    — in-app only (informational, routine)
 *
 * Anti-spam rules (email only):
 *   1. No self-notify — if the performer is the recipient, skip email.
 *   2. Dedup — same (userId, type, dedupKey) within DEDUP_WINDOW → skip email.
 *   3. Burst bundling — ≥ BURST_THRESHOLD high events for same userId
 *      within BURST_WINDOW → queue and send one digest email instead.
 */
const VALID_PRIORITIES = ['high', 'medium', 'low']

/* ── Anti-spam configuration ──────────────────────────────────── */
const DEDUP_WINDOW_MS = 60 * 60 * 1000          // 1 hour
const BURST_THRESHOLD = 3
const BURST_WINDOW_MS = 2 * 60 * 1000           // 2 minutes
const BURST_FLUSH_DELAY_MS = 10 * 1000           // flush digest 10s after first burst event

/* In-memory dedup + burst tracking (process-scoped, resets on restart) */
const _emailDedup = new Map()    // key → timestamp
const _burstQueues = new Map()   // userId → { items: [], timer }

function _dedupKey(userId, type, key) {
  return `${userId}:${type}:${key || ''}`
}

function _isDuplicate(userId, type, key) {
  const k = _dedupKey(userId, type, key)
  const lastSent = _emailDedup.get(k)
  if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) return true
  return false
}

function _recordSent(userId, type, key) {
  const k = _dedupKey(userId, type, key)
  _emailDedup.set(k, Date.now())
  /* Prune old entries periodically (> 10k) */
  if (_emailDedup.size > 10000) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS
    for (const [mapKey, ts] of _emailDedup) {
      if (ts < cutoff) _emailDedup.delete(mapKey)
    }
  }
}

/**
 * @param {object}  prisma
 * @param {object}  opts
 * @param {number}  opts.userId
 * @param {string}  opts.type
 * @param {string}  opts.message
 * @param {number}  [opts.actorId]
 * @param {number}  [opts.sheetId]
 * @param {string}  [opts.linkPath]
 * @param {string}  [opts.priority]  – 'high' | 'medium' | 'low'
 * @param {string}  [opts.dedupKey]  – optional dedup key (e.g. contentId) for email throttling
 * @param {number}  [opts.performerUserId] – the admin/user who performed the action (for self-notify guard)
 */
async function createNotification(prisma, {
  userId, type, message, actorId, sheetId, linkPath,
  priority, dedupKey, performerUserId,
}) {
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
      void _maybeEmailHighPriority(prisma, {
        userId, type, message, linkPath, dedupKey, performerUserId,
      }).catch(() => {})
    }

    return notif
  } catch (err) {
    // Non-fatal — log and continue
    console.error('createNotification error:', err.message)
  }
}

/**
 * Anti-spam gate before sending email.
 */
async function _maybeEmailHighPriority(prisma, { userId, type, message, linkPath, dedupKey, performerUserId }) {
  /* Rule 1: No self-notify — if admin performed this action on themselves, skip email */
  if (performerUserId && performerUserId === userId) return

  /* Rule 2: Dedup — same target reported repeatedly → one email per target per hour */
  if (dedupKey && _isDuplicate(userId, type, dedupKey)) return

  /* Rule 3: Burst bundling — ≥ 3 high events within 2 min → digest */
  const now = Date.now()
  let queue = _burstQueues.get(userId)
  if (!queue) {
    queue = { items: [], timer: null }
    _burstQueues.set(userId, queue)
  }
  /* Prune items outside burst window */
  queue.items = queue.items.filter(item => now - item.ts < BURST_WINDOW_MS)

  queue.items.push({ ts: now, type, message, linkPath })

  if (queue.items.length >= BURST_THRESHOLD) {
    /* Already in burst mode — the digest timer will flush everything */
    if (!queue.timer) {
      queue.timer = setTimeout(() => _flushBurstDigest(prisma, userId), BURST_FLUSH_DELAY_MS)
    }
    /* Record dedup so individual sends don't fire later */
    if (dedupKey) _recordSent(userId, type, dedupKey)
    return
  }

  /* Below burst threshold — send immediately */
  if (dedupKey) _recordSent(userId, type, dedupKey)
  await sendHighPriorityEmail(prisma, { userId, type, message, linkPath })
}

/**
 * Flush accumulated burst events as one digest email.
 */
async function _flushBurstDigest(prisma, userId) {
  const queue = _burstQueues.get(userId)
  if (!queue || queue.items.length === 0) return

  const items = [...queue.items]
  queue.items = []
  queue.timer = null

  let deliverMail, getFromAddress, getPublicAppUrl, escapeHtml
  try {
    const transport = require('./email/emailTransport')
    deliverMail = transport.deliverMail
    getFromAddress = transport.getFromAddress
    getPublicAppUrl = transport.getPublicAppUrl
    escapeHtml = transport.escapeHtml
  } catch {
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, username: true },
  })
  if (!user?.email || !user.emailVerified) return

  const appUrl = getPublicAppUrl()
  const bulletList = items
    .map(item => `<li style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(item.message)}</li>`)
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>StudyHub — Multiple Alerts</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#0f172a;padding:28px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:bold;">StudyHub</span>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Multiple Alerts (${items.length})</h2>
          <p style="margin:0 0 16px;color:#475569;font-size:15px;">
            Hi ${escapeHtml(user.username)}, you have ${items.length} high-priority notifications:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;">
            ${bulletList}
          </ul>
          <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
            Open Dashboard
          </a>
        </td></tr>
        <tr><td style="padding:16px 40px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Bundled digest — ${items.length} events in the last 2 minutes.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const textList = items.map((item, i) => `${i + 1}. ${item.message}`).join('\n')

  try {
    await deliverMail({
      from: `"StudyHub" <${getFromAddress()}>`,
      to: user.email,
      subject: `StudyHub — ${items.length} alerts need your attention`,
      text: `Hi ${user.username},\n\nYou have ${items.length} high-priority notifications:\n\n${textList}\n\nView: ${appUrl}`,
      html,
    }, 'high-priority-digest')
  } catch (err) {
    console.error('[notify] burst digest email failed:', err.message)
  }
}

/**
 * Sends an email for a single high-priority notification.
 * Looks up the user's email; only sends if they have a verified email.
 */
async function sendHighPriorityEmail(prisma, { userId, type, message, linkPath }) {
  let deliverMail, getFromAddress, getPublicAppUrl, escapeHtml
  try {
    const transport = require('./email/emailTransport')
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

/* Exported for testing */
module.exports = {
  createNotification,
  sendHighPriorityEmail,
  VALID_PRIORITIES,
  DEDUP_WINDOW_MS,
  BURST_THRESHOLD,
  BURST_WINDOW_MS,
  /* Test helpers */
  _emailDedup,
  _burstQueues,
}
