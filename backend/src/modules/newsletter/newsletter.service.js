/**
 * newsletter.service.js — data + business logic for the Product-Updates
 * newsletter (issue #291). The controller stays thin; all Prisma access,
 * sanitization, unsubscribe-token signing, and the batched send job live here.
 */
const crypto = require('node:crypto')
const sanitizeHtml = require('sanitize-html')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { runWithHeartbeat } = require('../../lib/jobs/heartbeat')
const { getPublicAppUrl } = require('../../lib/email/emailTransport')
const { sendNewsletterIssue } = require('../../lib/email/emailTemplates')
const {
  SANITIZE_OPTIONS,
  SEND_BATCH_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./newsletter.constants')

// ── small helpers ──────────────────────────────────────────────

// A8: never log raw email — correlate by a short sha256 suffix instead.
function hashEmail(email) {
  return crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(-8)
}

// Backend public origin (split from the frontend). Used for the RFC 8058
// one-click POST URL; falls back to the frontend origin if API_URL is unset.
function getApiUrl() {
  return process.env.API_URL || getPublicAppUrl()
}

function clampLimit(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE
  return Math.min(n, MAX_PAGE_SIZE)
}

function clampPage(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isInteger(n) || n < 1) return 1
  return n
}

function sanitizeBody(html) {
  return sanitizeHtml(String(html || ''), SANITIZE_OPTIONS)
}

function baseSlug(title) {
  const s = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return s || 'update'
}

async function uniqueSlug(title) {
  const base = baseSlug(title)
  let slug = base
  let n = 1
  // Loop is bounded in practice; titles rarely collide more than a few times.
  while (await prisma.newsletter.findUnique({ where: { slug } })) {
    n += 1
    slug = `${base}-${n}`
  }
  return slug
}

// ── unsubscribe tokens (HMAC, stateless) ───────────────────────

// A9: fail-closed in production — never sign with a dev fallback that is
// reachable in prod. In dev/test a fixed non-secret keeps the flow working.
function getUnsubscribeSecret() {
  const secret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET
  if (secret && secret.length >= 16) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEWSLETTER_UNSUBSCRIBE_SECRET is not configured (required to sign unsubscribe links)',
    )
  }
  return 'dev-only-newsletter-unsubscribe-secret-change-me'
}

function generateUnsubscribeToken(userId) {
  const payload = String(userId)
  const sig = crypto
    .createHmac('sha256', getUnsubscribeSecret())
    .update(`newsletter-unsub:${payload}`)
    .digest('base64url')
  return `${payload}.${sig}`
}

// Returns the userId on a valid signature, otherwise null. Constant-time compare.
function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const idx = token.lastIndexOf('.')
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const userId = Number.parseInt(payload, 10)
  if (!Number.isInteger(userId) || userId < 1 || !sig) return null
  let expected
  try {
    expected = crypto
      .createHmac('sha256', getUnsubscribeSecret())
      .update(`newsletter-unsub:${payload}`)
      .digest('base64url')
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!crypto.timingSafeEqual(a, b)) return null
  return userId
}

async function unsubscribeByToken(token) {
  const userId = verifyUnsubscribeToken(token)
  if (!userId) return { ok: false }
  await prisma.userPreferences.upsert({
    where: { userId },
    update: { emailProductUpdates: false },
    create: { userId, emailProductUpdates: false },
  })
  log.info({ event: 'newsletter.unsubscribe', userId }, 'User unsubscribed from product updates')
  return { ok: true }
}

// ── serializers ────────────────────────────────────────────────

function authorOf(n) {
  return n.author
    ? {
        id: n.author.id,
        username: n.author.username,
        displayName: n.author.displayName ?? null,
        avatarUrl: n.author.avatarUrl ?? null,
      }
    : null
}

// Card = list view; omit the (potentially large) bodyHtml.
function serializeCard(n) {
  return {
    id: n.id,
    slug: n.slug,
    title: n.title,
    summary: n.summary,
    category: n.category,
    publishedAt: n.publishedAt,
    author: authorOf(n),
  }
}

function serializePublic(n) {
  return {
    id: n.id,
    slug: n.slug,
    title: n.title,
    summary: n.summary,
    bodyHtml: n.bodyHtml,
    category: n.category,
    publishedAt: n.publishedAt,
    author: authorOf(n),
  }
}

function serializeAdmin(n) {
  return {
    id: n.id,
    slug: n.slug,
    title: n.title,
    summary: n.summary,
    bodyHtml: n.bodyHtml,
    category: n.category,
    status: n.status,
    isPublic: n.isPublic,
    publishedAt: n.publishedAt,
    emailSentAt: n.emailSentAt,
    emailRecipientCount: n.emailRecipientCount,
    author: n.author ? { id: n.author.id, username: n.author.username } : null,
    sendCount: n._count ? n._count.sends : undefined,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }
}

const authorSelect = {
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
}

// ── public reads ───────────────────────────────────────────────

async function listPublished({ page, limit } = {}) {
  const take = clampLimit(limit)
  const current = clampPage(page)
  const where = { status: 'published', isPublic: true }
  const [rows, total] = await Promise.all([
    prisma.newsletter.findMany({
      where,
      include: authorSelect,
      orderBy: { publishedAt: 'desc' },
      skip: (current - 1) * take,
      take,
    }),
    prisma.newsletter.count({ where }),
  ])
  return { items: rows.map(serializeCard), total, page: current, limit: take }
}

async function getPublicBySlug(slug) {
  const n = await prisma.newsletter.findFirst({
    where: { slug, status: 'published', isPublic: true },
    include: authorSelect,
  })
  return n ? serializePublic(n) : null
}

// ── admin reads + writes ───────────────────────────────────────

async function listAdmin({ page, limit } = {}) {
  const take = clampLimit(limit)
  const current = clampPage(page)
  const [rows, total] = await Promise.all([
    prisma.newsletter.findMany({
      include: { ...authorSelect, _count: { select: { sends: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (current - 1) * take,
      take,
    }),
    prisma.newsletter.count(),
  ])
  return { items: rows.map(serializeAdmin), total, page: current, limit: take }
}

async function getAdminById(id) {
  const n = await prisma.newsletter.findUnique({
    where: { id },
    include: { ...authorSelect, _count: { select: { sends: true } } },
  })
  return n ? serializeAdmin(n) : null
}

async function createDraft({ title, summary, bodyHtml, category, isPublic, authorId }) {
  const slug = await uniqueSlug(title)
  const row = await prisma.newsletter.create({
    data: {
      slug,
      title,
      summary: summary || null,
      bodyHtml: sanitizeBody(bodyHtml),
      category,
      status: 'draft',
      isPublic: isPublic === undefined ? true : !!isPublic,
      authorId: authorId ?? null,
    },
    include: { ...authorSelect, _count: { select: { sends: true } } },
  })
  return serializeAdmin(row)
}

async function updateDraft(id, patch) {
  const data = {}
  if (patch.title !== undefined) data.title = patch.title
  if (patch.summary !== undefined) data.summary = patch.summary || null
  if (patch.bodyHtml !== undefined) data.bodyHtml = sanitizeBody(patch.bodyHtml)
  if (patch.category !== undefined) data.category = patch.category
  if (patch.isPublic !== undefined) data.isPublic = !!patch.isPublic
  const row = await prisma.newsletter.update({
    where: { id },
    data,
    include: { ...authorSelect, _count: { select: { sends: true } } },
  })
  return serializeAdmin(row)
}

async function publishNewsletter(id) {
  const existing = await prisma.newsletter.findUnique({ where: { id } })
  if (!existing) return null
  const row = await prisma.newsletter.update({
    where: { id },
    data: { status: 'published', publishedAt: existing.publishedAt || new Date() },
    include: { ...authorSelect, _count: { select: { sends: true } } },
  })
  return serializeAdmin(row)
}

async function unpublishNewsletter(id) {
  const existing = await prisma.newsletter.findUnique({ where: { id } })
  if (!existing) return null
  const row = await prisma.newsletter.update({
    where: { id },
    data: { status: 'draft' },
    include: { ...authorSelect, _count: { select: { sends: true } } },
  })
  return serializeAdmin(row)
}

async function removeNewsletter(id) {
  await prisma.newsletter.delete({ where: { id } })
}

// ── send job ───────────────────────────────────────────────────

async function recordSend(newsletterId, userId, email, status, error) {
  try {
    await prisma.newsletterSend.upsert({
      where: { newsletterId_userId: { newsletterId, userId } },
      update: { status, error: error || null },
      create: { newsletterId, userId, email, status, error: error || null },
    })
  } catch (e) {
    log.warn(
      { event: 'newsletter.send_record_failed', newsletterId, err: e.message },
      'Failed to record newsletter send row',
    )
  }
}

/**
 * Core send routine — idempotent and resumable. Emails every opted-in user
 * who has not already received this issue, skipping suppressed addresses.
 * Exported for direct (awaitable) use in tests; production calls it through
 * the fire-and-forget `sendNewsletter` wrapper below.
 */
async function runSend(newsletterId) {
  const n = await prisma.newsletter.findUnique({ where: { id: newsletterId } })
  if (!n || n.status !== 'published') {
    log.warn(
      {
        event: 'newsletter.send_skipped',
        newsletterId,
        reason: !n ? 'not_found' : 'not_published',
      },
      'Newsletter send skipped',
    )
    return { sent: 0, skipped: 0, failed: 0 }
  }

  // Opted-in = has an email AND (no preferences row OR emailProductUpdates true).
  // Prisma 6 null syntax: NOT: [{ field: null }] (CLAUDE.md pitfall #3).
  const users = await prisma.user.findMany({
    where: {
      NOT: [{ email: null }],
      OR: [{ preferences: { is: null } }, { preferences: { emailProductUpdates: true } }],
    },
    select: { id: true, email: true, username: true, displayName: true },
  })

  // Idempotency: skip anyone already recorded for this issue.
  const prior = await prisma.newsletterSend.findMany({
    where: { newsletterId },
    select: { userId: true },
  })
  const alreadySent = new Set(prior.map((p) => p.userId))

  // Suppression set (bounce/complaint). Wrapped defensively — if the table is
  // unavailable the per-send deliverMail guard still rejects suppressed mail.
  let suppressed = new Set()
  try {
    const rows = await prisma.emailSuppression.findMany({
      where: { active: true },
      select: { email: true },
    })
    suppressed = new Set(rows.map((r) => r.email.toLowerCase()))
  } catch (e) {
    log.warn(
      { event: 'newsletter.suppression_unavailable', err: e.message },
      'Could not load suppression list; relying on per-send guard',
    )
  }

  const targets = users.filter((u) => u.email && !alreadySent.has(u.id))
  let sent = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < targets.length; i += SEND_BATCH_SIZE) {
    const batch = targets.slice(i, i + SEND_BATCH_SIZE)
    await Promise.all(
      batch.map(async (u) => {
        if (suppressed.has(u.email.toLowerCase())) {
          skipped += 1
          await recordSend(newsletterId, u.id, u.email, 'skipped', 'suppressed')
          return
        }
        try {
          const token = generateUnsubscribeToken(u.id)
          await sendNewsletterIssue({
            toEmail: u.email,
            username: u.displayName || u.username,
            newsletter: n,
            unsubscribeUrl: `${getPublicAppUrl()}/unsubscribe?token=${encodeURIComponent(token)}`,
            oneClickUrl: `${getApiUrl()}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
          })
          sent += 1
          await recordSend(newsletterId, u.id, u.email, 'sent', null)
        } catch (err) {
          failed += 1
          await recordSend(newsletterId, u.id, u.email, 'failed', err.message)
          log.warn(
            {
              event: 'newsletter.send_failed',
              newsletterId,
              userId: u.id,
              emailHash: hashEmail(u.email),
              err: err.message,
            },
            'Newsletter email send failed',
          )
        }
      }),
    )
  }

  await prisma.newsletter.update({
    where: { id: newsletterId },
    data: { emailSentAt: new Date(), emailRecipientCount: { increment: sent } },
  })
  log.info(
    { event: 'newsletter.send_complete', newsletterId, sent, skipped, failed },
    'Newsletter send complete',
  )
  return { sent, skipped, failed }
}

// Fire-and-forget background send (A10 — wrapped in runWithHeartbeat for
// observable job.start / job.success / job.failure events).
function sendNewsletter(newsletterId) {
  runWithHeartbeat('newsletter.send', () => runSend(newsletterId), { slaMs: 5 * 60_000 })
  return { queued: true }
}

module.exports = {
  // reads
  listPublished,
  getPublicBySlug,
  listAdmin,
  getAdminById,
  // writes
  createDraft,
  updateDraft,
  publishNewsletter,
  unpublishNewsletter,
  removeNewsletter,
  // send
  sendNewsletter,
  runSend,
  // unsubscribe / tokens
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeByToken,
  // exported for tests
  sanitizeBody,
  baseSlug,
}
