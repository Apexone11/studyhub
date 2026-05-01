const { captureError } = require('../../monitoring/sentry')
const log = require('../../lib/logger')
const prisma = require('../../lib/prisma')
const { sendDataRequest } = require('../../lib/email/email')
const { isValidEmailAddress } = require('../../lib/email/emailValidation')
const {
  acceptCurrentLegalDocuments,
  getCurrentLegalDocument,
  getCurrentLegalDocuments,
  getUserLegalStatus,
} = require('./legal.service')

const ALLOWED_REQUEST_TYPES = new Set(['access', 'correction', 'deletion', 'portability', 'other'])
const ALLOWED_LAWS = new Set(['CCPA', 'GDPR', 'Both', 'Other'])
const MAX_NAME_LEN = 120
const MAX_EMAIL_LEN = 254
const MAX_MESSAGE_LEN = 2000

function trimString(value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

async function getCurrentDocuments(req, res) {
  try {
    const documents = await getCurrentLegalDocuments()
    res.json({ documents })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not load legal documents.' })
  }
}

async function getCurrentDocumentBySlug(req, res) {
  try {
    const document = await getCurrentLegalDocument(req.params.slug)
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found.' })
    }

    res.json(document)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method, slug: req.params.slug })
    res.status(500).json({ error: 'Could not load the legal document.' })
  }
}

async function getMyLegalStatus(req, res) {
  try {
    const status = await getUserLegalStatus(req.user.userId)
    if (!status) return res.status(404).json({ error: 'User not found.' })
    res.json(status)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not load legal acceptance status.' })
  }
}

async function acceptMyCurrentLegalDocuments(req, res) {
  try {
    const status = await acceptCurrentLegalDocuments(req.user.userId)
    res.json(status)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not save your legal acceptance.' })
  }
}

/**
 * POST /api/legal/data-request
 *
 * Accepts a Data Subject Access Request (DSAR) form submission. The
 * submission is persisted to the `LegalRequest` table BEFORE attempting
 * to email — DB write is the durability guarantee, the email is just a
 * convenience signal for the admin inbox. If the DB write fails the
 * request returns 500 so the user knows to retry; if only the email
 * fails the row is still preserved for admin triage.
 *
 * Bot defenses:
 *   - Honeypot field `website`: any non-empty value silently 200s
 *     without persisting. Real users never fill a hidden field.
 *   - Rate limited at 3/hr/IP via legalDataRequestLimiter (mounted on
 *     the route).
 *   - Origin allowlist on the route via originAllowlist middleware.
 *
 * Returns a generic 200 response that does not distinguish between
 * "email sent" and "email failed but row persisted" — the user gets
 * the same UX either way and the admin reads from the table.
 */
async function submitDataRequest(req, res) {
  const body = req.body || {}

  // Honeypot — silently succeed without persisting. Bots that fill
  // every field hit this and get the same 200 a real submitter does,
  // so they can't probe for the bypass.
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return res.status(200).json({ ok: true })
  }

  const requesterName = trimString(body.name, MAX_NAME_LEN)
  const requesterEmail = trimString(body.email, MAX_EMAIL_LEN).toLowerCase()
  const requestType = trimString(body.requestType, 32)
  const law = trimString(body.law, 16)
  const message = trimString(body.message, MAX_MESSAGE_LEN)

  if (!requesterName) {
    return res.status(400).json({ error: 'Name is required.' })
  }
  if (!isValidEmailAddress(requesterEmail)) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }
  if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
    return res.status(400).json({ error: 'Select a valid request type.' })
  }
  if (!ALLOWED_LAWS.has(law)) {
    return res.status(400).json({ error: 'Select a valid governing law.' })
  }

  const submittedAtIso = new Date().toISOString()
  const requesterIp = typeof req.ip === 'string' ? req.ip.slice(0, 64) : null
  const userAgent = trimString(req.headers['user-agent'], 1000)

  // DB write FIRST — this is the durability guarantee. If we can't
  // persist, return 500 so the user can retry. Persisting before
  // emailing means a transient SMTP outage can't lose the submission.
  let createdRow
  try {
    createdRow = await prisma.legalRequest.create({
      data: {
        requesterName,
        requesterEmail,
        requestType,
        law,
        message: message || null,
        ipAddress: requesterIp,
        userAgent: userAgent || null,
      },
      select: { id: true },
    })
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method,
      tag: 'legal.data_request.persist_failed',
    })
    return res.status(500).json({
      error: 'Could not save your request. Please try again or email us directly.',
    })
  }

  // Audit log carries the row ID + non-PII metadata only. The original
  // 2026-04-30 implementation logged requesterName + requesterEmail +
  // requesterIp at warn level, which would have replicated PII across
  // log aggregation and backups. The DB row holds the raw PII; access
  // is gated by Postgres permissions and the admin-only triage route.
  // Hashed-email-prefix for correlation across log lines without
  // surfacing the address (8 hex chars of SHA-256 of the lower-cased
  // email — enough to spot duplicate submissions, not enough to
  // identify a person).
  let emailHashPrefix = null
  try {
    emailHashPrefix = require('node:crypto')
      .createHash('sha256')
      .update(requesterEmail)
      .digest('hex')
      .slice(0, 8)
  } catch {
    /* hash unavailable — log without it */
  }
  log.warn(
    {
      event: 'legal.data_request.submitted',
      legalRequestId: createdRow.id,
      requestType,
      law,
      hasMessage: Boolean(message),
      submittedAtIso,
      emailHashPrefix,
    },
    'DSAR submission received',
  )

  // Best-effort email. Failure here updates the row but doesn't leak
  // the failure mode to the requester (generic 200).
  try {
    await sendDataRequest({
      requesterName,
      requesterEmail,
      requestType,
      law,
      message: message || null,
      submittedAtIso,
      requesterIp,
    })
    await prisma.legalRequest
      .update({ where: { id: createdRow.id }, data: { emailSent: true } })
      .catch(() => {
        /* row update failure is non-fatal; the request itself is persisted */
      })
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method,
      tag: 'legal.data_request.email_failed',
      legalRequestId: createdRow.id,
    })
    await prisma.legalRequest
      .update({
        where: { id: createdRow.id },
        data: { emailError: String(error?.message || 'send failed').slice(0, 500) },
      })
      .catch(() => {})
  }

  return res.status(200).json({ ok: true })
}

/**
 * GET /api/legal/admin/data-requests?status=open|resolved|all&limit=N
 * Admin-only listing of DSAR submissions. Default sort: most recent first.
 */
async function listDataRequestsAdmin(req, res) {
  try {
    const statusParam = String(req.query.status || 'open').toLowerCase()
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200)

    const where = {}
    if (statusParam === 'open') where.resolvedAt = null
    else if (statusParam === 'resolved') where.NOT = [{ resolvedAt: null }]

    const requests = await prisma.legalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        requesterName: true,
        requesterEmail: true,
        requestType: true,
        law: true,
        message: true,
        ipAddress: true,
        emailSent: true,
        emailError: true,
        resolvedAt: true,
        resolvedById: true,
        resolutionNote: true,
        createdAt: true,
      },
    })
    res.json({ requests })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not load data requests.' })
  }
}

/**
 * POST /api/legal/admin/data-requests/:id/resolve
 * Admin-only — mark a DSAR resolved.
 */
async function resolveDataRequestAdmin(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid request id.' })
    }
    const note = trimString(req.body?.note || '', 1000)

    const updated = await prisma.legalRequest.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedById: req.user?.userId || null,
        resolutionNote: note || null,
      },
      select: { id: true, resolvedAt: true },
    })
    res.json({ ok: true, request: updated })
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Data request not found.' })
    }
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not resolve data request.' })
  }
}

module.exports = {
  acceptMyCurrentLegalDocuments,
  getCurrentDocumentBySlug,
  getCurrentDocuments,
  getMyLegalStatus,
  submitDataRequest,
  listDataRequestsAdmin,
  resolveDataRequestAdmin,
}
