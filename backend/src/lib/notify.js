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
const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  emailDigest: true,
  emailMentions: true,
  emailContributions: true,
  emailComments: true,
  emailSocial: true,
  emailStudyGroups: true,
  inAppNotifications: true,
  inAppMentions: true,
  inAppComments: true,
  inAppSocial: true,
  inAppContributions: true,
  inAppStudyGroups: true,
})
const NOTIFICATION_PREFERENCE_SELECT = Object.freeze({
  emailDigest: true,
  emailMentions: true,
  emailContributions: true,
  emailComments: true,
  emailSocial: true,
  emailStudyGroups: true,
  inAppNotifications: true,
  inAppMentions: true,
  inAppComments: true,
  inAppSocial: true,
  inAppContributions: true,
  inAppStudyGroups: true,
})
const ESSENTIAL_NOTIFICATION_TYPES = new Set([
  'legal_acceptance_required',
  'moderation',
  'payment_failed',
  'video_copy_detected',
])

// Notification types that suffer viral fan-out (one popular post → many
// rows from many actors). For these, we dedup against (recipient, type,
// actor) within an hour. Critical types (mention, reply, contribution,
// moderation) are NEVER deduped here.
const FAN_OUT_DEDUP_TYPES = new Set(['star', 'fork', 'follow', 'follow_request'])
const FAN_OUT_DEDUP_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const OPTIONAL_EMAIL_PREFERENCE_BY_TYPE = Object.freeze({
  mention: 'emailMentions',
  contribution: 'emailContributions',
  upstream_change: 'emailContributions',
  comment: 'emailComments',
  reply: 'emailComments',
  follow_request: 'emailSocial',
  follow: 'emailSocial',
  follow_accepted: 'emailSocial',
  star: 'emailSocial',
  fork: 'emailSocial',
  group_join: 'emailStudyGroups',
  group_approved: 'emailStudyGroups',
  group_invite: 'emailStudyGroups',
  group_session: 'emailStudyGroups',
  group_post: 'emailStudyGroups',
})
const OPTIONAL_IN_APP_PREFERENCE_BY_TYPE = Object.freeze({
  mention: 'inAppMentions',
  contribution: 'inAppContributions',
  upstream_change: 'inAppContributions',
  comment: 'inAppComments',
  reply: 'inAppComments',
  follow_request: 'inAppSocial',
  follow: 'inAppSocial',
  follow_accepted: 'inAppSocial',
  star: 'inAppSocial',
  fork: 'inAppSocial',
  group_join: 'inAppStudyGroups',
  group_approved: 'inAppStudyGroups',
  group_invite: 'inAppStudyGroups',
  group_session: 'inAppStudyGroups',
  group_post: 'inAppStudyGroups',
})
const EMAIL_TYPE_LABELS = Object.freeze({
  mention: 'You Were Mentioned',
  contribution: 'Contribution Update',
  upstream_change: 'Sheet Update',
  comment: 'New Comment Activity',
  reply: 'New Reply Activity',
  follow_request: 'New Follow Request',
  follow: 'New Follower',
  follow_accepted: 'Follow Request Approved',
  star: 'New Sheet Star',
  fork: 'New Sheet Fork',
  group_join: 'Study Group Update',
  group_approved: 'Study Group Update',
  group_invite: 'Study Group Invitation',
  group_session: 'Study Group Session',
  group_post: 'Study Group Discussion',
  legal_acceptance_required: 'Legal Reminder',
  moderation: 'Moderation Notice',
  payment_failed: 'Payment Update',
  video_copy_detected: 'Video Copy Alert',
})

/* ── Anti-spam configuration ──────────────────────────────────── */
const DEDUP_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const BURST_THRESHOLD = 3
const BURST_WINDOW_MS = 2 * 60 * 1000 // 2 minutes
const BURST_FLUSH_DELAY_MS = 10 * 1000 // flush digest 10s after first burst event

/* In-memory dedup + burst tracking (process-scoped, resets on restart) */
const _emailDedup = new Map() // key → timestamp
const _burstQueues = new Map() // userId → { items: [], timer }

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

async function _loadNotificationPreferences(prisma, userId) {
  if (!prisma?.userPreferences?.findUnique || !Number.isInteger(userId)) {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }

  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: NOTIFICATION_PREFERENCE_SELECT,
    })

    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(prefs || {}) }
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }
}

function _isEssentialNotification(type) {
  return ESSENTIAL_NOTIFICATION_TYPES.has(type)
}

function _shouldCreateInAppNotification(preferences, type) {
  if (_isEssentialNotification(type)) return true

  const prefKey = OPTIONAL_IN_APP_PREFERENCE_BY_TYPE[type]
  if (!prefKey) return true

  return Boolean(preferences.inAppNotifications && preferences[prefKey])
}

function _shouldSendEmailNotification(preferences, type, priority) {
  if (_isEssentialNotification(type)) {
    return priority === 'high'
  }

  const prefKey = OPTIONAL_EMAIL_PREFERENCE_BY_TYPE[type]
  if (!prefKey) return false

  return Boolean(preferences[prefKey])
}

function _getEmailTypeLabel(type, priority) {
  return EMAIL_TYPE_LABELS[type] || (priority === 'high' ? 'Important Update' : 'New Activity')
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
async function createNotification(
  prisma,
  {
    userId,
    type,
    message,
    actorId,
    sheetId,
    linkPath,
    priority,
    dedupKey,
    performerUserId,
    eventContext,
  },
) {
  if (userId === actorId) return // never notify yourself
  const safePriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium'
  const preferences = await _loadNotificationPreferences(prisma, userId)

  if (!_shouldCreateInAppNotification(preferences, type)) {
    return null
  }

  // Block-aware gate: if either party has blocked the other, silently drop
  // the notification. Without this, a blocked user can still passively spam
  // the recipient's inbox via star/follow/fork churn. Block-table queries
  // can fail (table missing during migration); on error we fail open and let
  // the notification through, matching the policy used elsewhere in the
  // module per CLAUDE.md "Block/Mute System".
  if (actorId && actorId !== userId) {
    try {
      const { isBlockedEitherWay } = require('./social/blockFilter')
      const blocked = await isBlockedEitherWay(prisma, userId, actorId)
      if (blocked) return null
    } catch {
      // Fail open — block tables may be temporarily unavailable.
    }
  }

  // Viral fan-out guard: a sheet that suddenly receives 1000 stars from
  // 1000 different users would otherwise produce 1000 DB rows + 1000
  // socket emits + 1000 dropdown rows. For low-signal social events we
  // dedup against the same (recipient, type, actor, sheet) within an
  // hour — the first event lands, repeats from the same actor on the
  // SAME sheet are dropped. Different sheets from the same actor still
  // notify, so a fan who stars five of your sheets in a session still
  // produces five separate notifications (the genuine engagement signal).
  // For follow events that have no sheetId, the dedup degrades to
  // (recipient, type, actor) which catches the rapid follow / unfollow
  // / re-follow harassment pattern.
  if (FAN_OUT_DEDUP_TYPES.has(type) && actorId && actorId !== userId) {
    try {
      const since = new Date(Date.now() - FAN_OUT_DEDUP_WINDOW_MS)
      const recent = await prisma.notification.findFirst({
        where: {
          userId,
          type,
          actorId,
          ...(sheetId ? { sheetId } : {}),
          createdAt: { gte: since },
        },
        select: { id: true },
      })
      if (recent) return null
    } catch {
      // Read failure shouldn't block the notification.
    }
  }

  // Role-aware gate (docs/internal/roles-and-permissions-plan.md §10.1). Callers can
  // opt into the filter by passing { schoolId, courseId, hashtagId } in
  // eventContext plus a scoped `type` (e.g. 'school.announcement.created').
  if (eventContext && typeof eventContext === 'object') {
    try {
      const { shouldSendForRole } = require('./roleNotifications')
      const recipient = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          accountType: true,
          enrollments: { select: { course: { select: { id: true, schoolId: true } } } },
          hashtagFollows: { select: { hashtagId: true } },
        },
      })
      if (recipient) {
        const schoolIds = [
          ...new Set(
            recipient.enrollments
              .map((e) => e.course?.schoolId)
              .filter((id) => typeof id === 'number'),
          ),
        ]
        const enrolledCourseIds = recipient.enrollments
          .map((e) => e.course?.id)
          .filter((id) => typeof id === 'number')
        const followedHashtagIds = recipient.hashtagFollows.map((h) => h.hashtagId)
        const allow = shouldSendForRole(
          { type, ...eventContext },
          {
            accountType: recipient.accountType,
            schoolIds,
            enrolledCourseIds,
            followedHashtagIds,
          },
        )
        if (!allow) return null
      }
    } catch {
      // Role filter is best-effort. If the lookup fails (e.g. missing tables
      // during migration), fall through and let the default delivery proceed.
    }
  }

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
      },
      include: {
        actor: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    })

    // Real-time push: emit to the user's personal socket room so any open tab
    // surfaces the notification immediately instead of waiting up to 30s for
    // the next polling cycle. Lazy-required to avoid a circular dependency
    // between notify.js and socketio.js, AND skipped in tests where loading
    // socketio.js would pull in the real Prisma client and stall.
    if (process.env.NODE_ENV !== 'test') {
      try {
        const { emitToUser } = require('./socketio')
        const SOCKET_EVENTS = require('./socketEvents')
        const eventName = SOCKET_EVENTS?.NOTIFICATION_NEW || 'notification:new'
        emitToUser(userId, eventName, {
          id: notif.id,
          type,
          message,
          priority: safePriority,
          linkPath: linkPath || null,
          sheetId: sheetId || null,
          actorId: actorId || null,
          actor: notif.actor || null,
          createdAt: notif.createdAt,
          read: false,
        })
      } catch {
        // Socket.io optional — never block notification persistence on emit failure.
      }
    }

    if (_shouldSendEmailNotification(preferences, type, safePriority)) {
      void _maybeSendNotificationEmail(prisma, {
        userId,
        type,
        message,
        linkPath,
        dedupKey,
        performerUserId,
        priority: safePriority,
      }).catch(() => {})
    }

    return notif
  } catch (err) {
    // Non-fatal — log and continue
    console.error('createNotification error:', err.message)
  }
}

async function createNotifications(prisma, notifications = []) {
  return Promise.allSettled(
    notifications.map((notification) => createNotification(prisma, notification)),
  )
}

/**
 * Anti-spam gate before sending email.
 */
async function _maybeSendNotificationEmail(
  prisma,
  { userId, type, message, linkPath, dedupKey, performerUserId, priority },
) {
  if (performerUserId && performerUserId === userId) return

  // Effective dedup key: callers that don't pass an explicit dedupKey
  // (most social events: star / fork / follow) still need rate limiting,
  // otherwise every event sends an email unconditionally. Falling back to
  // `type` gives one-email-per-(recipient,type)-per-window protection.
  const effectiveDedupKey = dedupKey || type

  if (priority !== 'high') {
    if (_isDuplicate(userId, type, effectiveDedupKey)) return
    _recordSent(userId, type, effectiveDedupKey)
    await sendNotificationEmail(prisma, { userId, type, message, linkPath, priority })
    return
  }

  if (_isDuplicate(userId, type, effectiveDedupKey)) return

  const now = Date.now()
  let queue = _burstQueues.get(userId)
  if (!queue) {
    queue = { items: [], timer: null }
    _burstQueues.set(userId, queue)
  }
  /* Prune items outside burst window */
  queue.items = queue.items.filter((item) => now - item.ts < BURST_WINDOW_MS)

  queue.items.push({ ts: now, type, message, linkPath })

  if (queue.items.length >= BURST_THRESHOLD) {
    if (!queue.timer) {
      queue.timer = setTimeout(() => _flushBurstDigest(prisma, userId), BURST_FLUSH_DELAY_MS)
    }
    _recordSent(userId, type, effectiveDedupKey)
    return
  }

  _recordSent(userId, type, effectiveDedupKey)
  await sendNotificationEmail(prisma, {
    userId,
    type,
    message,
    linkPath,
    priority,
  })
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
    .map(
      (item) =>
        `<li style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(item.message)}</li>`,
    )
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
    await deliverMail(
      {
        from: `"StudyHub" <${getFromAddress()}>`,
        to: user.email,
        subject: `StudyHub — ${items.length} alerts need your attention`,
        text: `Hi ${user.username},\n\nYou have ${items.length} high-priority notifications:\n\n${textList}\n\nView: ${appUrl}`,
        html,
      },
      'high-priority-digest',
    )
  } catch (err) {
    console.error('[notify] burst digest email failed:', err.message)
  }
}

/**
 * Sends an email for a single notification.
 */
async function sendNotificationEmail(
  prisma,
  { userId, type, message, linkPath, priority = 'medium' },
) {
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
  const typeLabel = _getEmailTypeLabel(type, priority)
  const footerText =
    priority === 'high'
      ? 'You received this because of an important account event on your StudyHub account.'
      : 'You received this because this activity email is enabled in your StudyHub settings.'

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
          <p style="margin:0;color:#9ca3af;font-size:12px;">${escapeHtml(footerText)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await deliverMail(
    {
      from: `"StudyHub" <${getFromAddress()}>`,
      to: user.email,
      subject: `StudyHub — ${typeLabel}`,
      text: `${typeLabel}: ${message}\n\nView details: ${actionUrl}`,
      html,
    },
    priority === 'high' ? 'high-priority-notification' : 'notification-preference-email',
  )
}

async function sendHighPriorityEmail(prisma, options) {
  return sendNotificationEmail(prisma, { ...options, priority: 'high' })
}

/* Exported for testing */
module.exports = {
  createNotification,
  createNotifications,
  sendNotificationEmail,
  sendHighPriorityEmail,
  VALID_PRIORITIES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_SELECT,
  OPTIONAL_EMAIL_PREFERENCE_BY_TYPE,
  OPTIONAL_IN_APP_PREFERENCE_BY_TYPE,
  ESSENTIAL_NOTIFICATION_TYPES,
  DEDUP_WINDOW_MS,
  BURST_THRESHOLD,
  BURST_WINDOW_MS,
  /* Test helpers */
  _emailDedup,
  _burstQueues,
}
