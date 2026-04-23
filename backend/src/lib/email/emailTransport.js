const fs = require('node:fs/promises')
const path = require('node:path')
const nodemailer = require('nodemailer')
const prisma = require('../prisma')
const DEFAULT_ADMIN_EMAIL = 'abdulrfornah@getstudyhub.org'
const RESEND_API_BASE_URL = 'https://api.resend.com'

function getPublicAppUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getFromAddress() {
  const raw = (process.env.EMAIL_FROM || process.env.EMAIL_USER || DEFAULT_ADMIN_EMAIL).trim()
  // Extract bare email if the value already includes a display name (e.g. "Name <email>")
  const match = raw.match(/<([^>]+)>/)
  return match ? match[1] : raw
}

function getAdminEmail() {
  return (process.env.ADMIN_EMAIL || process.env.EMAIL_USER || DEFAULT_ADMIN_EMAIL)
    .trim()
    .toLowerCase()
}

function getResendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return null

  const configuredBaseUrl = String(process.env.RESEND_API_BASE_URL || '').trim()
  const baseUrl = (configuredBaseUrl || RESEND_API_BASE_URL).replace(/\/+$/, '')

  return {
    apiKey,
    baseUrl,
  }
}

function shouldUseResend() {
  const transport = String(process.env.EMAIL_TRANSPORT || '').toLowerCase()
  const provider = String(process.env.EMAIL_PROVIDER || '').toLowerCase()

  if (transport === 'resend' || provider === 'resend') return true

  return Boolean(getResendConfig()) && !process.env.EMAIL_USER && !process.env.EMAIL_PASS
}

function getEmailMode() {
  const transport = String(process.env.EMAIL_TRANSPORT || '').toLowerCase()
  if (transport === 'json') return 'json'
  if (shouldUseResend()) return 'resend'
  if (process.env.EMAIL_CAPTURE_DIR) return 'capture'
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS)
    return process.env.EMAIL_HOST ? 'smtp-host' : 'provider'
  return 'json'
}

// Create transporter lazily so missing env vars don't crash on startup
function getTransporter(mode = getEmailMode()) {
  if (mode === 'json') {
    return nodemailer.createTransport({ jsonTransport: true })
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null
  const auth = {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }

  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true',
      auth,
    })
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth,
  })
}

function normalizeEmailRecipients(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean)
  }

  const single = String(value || '').trim()
  return single ? [single] : []
}

function normalizeRecipientLookupEmail(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized || null
}

function getRecipientLookupEmails(value) {
  const recipients = normalizeEmailRecipients(value)
  if (recipients.length === 0) return []

  return [
    ...new Set(
      recipients.map((recipient) => normalizeRecipientLookupEmail(recipient)).filter(Boolean),
    ),
  ]
}

async function getSuppressedRecipients(toValue) {
  const lookupEmails = getRecipientLookupEmails(toValue)
  if (lookupEmails.length === 0) return []

  try {
    return await prisma.emailSuppression.findMany({
      where: {
        active: true,
        email: { in: lookupEmails },
      },
      select: {
        email: true,
        reason: true,
      },
    })
  } catch (error) {
    console.warn(`[email] suppression lookup failed: ${error.message}`)
    return []
  }
}

async function assertRecipientsAllowed(toValue) {
  const suppressedRecipients = await getSuppressedRecipients(toValue)
  if (suppressedRecipients.length === 0) return

  const blockedAddresses = suppressedRecipients.map((entry) => entry.email).filter(Boolean)
  const blockedReasons = [
    ...new Set(suppressedRecipients.map((entry) => entry.reason).filter(Boolean)),
  ]

  const error = new Error(
    `Email delivery blocked for suppressed recipient(s): ${blockedAddresses.join(', ')}`,
  )
  error.code = 'EMAIL_RECIPIENT_SUPPRESSED'
  error.suppressedRecipients = blockedAddresses
  error.suppressionReasons = blockedReasons
  throw error
}

async function parseJsonSafely(response) {
  const rawBody = await response.text()
  if (!rawBody) return null

  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

async function sendWithResend(mailOptions) {
  const resendConfig = getResendConfig()
  if (!resendConfig) {
    throw new Error(
      'Resend delivery is not configured. Set RESEND_API_KEY and EMAIL_TRANSPORT=resend.',
    )
  }

  const recipients = normalizeEmailRecipients(mailOptions.to)
  if (recipients.length === 0) {
    throw new Error('Resend delivery requires at least one recipient email address.')
  }

  const payload = {
    from: mailOptions.from,
    to: recipients,
    subject: mailOptions.subject,
  }

  if (mailOptions.text) payload.text = mailOptions.text
  if (mailOptions.html) payload.html = mailOptions.html

  const replyTo = normalizeEmailRecipients(mailOptions.replyTo)
  if (replyTo.length > 0) {
    payload.reply_to = replyTo
  }

  const response = await fetch(`${resendConfig.baseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const responsePayload = await parseJsonSafely(response)
  if (!response.ok) {
    const errorMessage =
      responsePayload?.message ||
      responsePayload?.error ||
      `${response.status} ${response.statusText}`.trim()
    throw new Error(`Resend API request failed: ${errorMessage}`)
  }

  return {
    messageId: responsePayload?.id || null,
    accepted: recipients,
    rejected: [],
  }
}

async function validateEmailTransport({ logger = console, strict = false } = {}) {
  const mode = getEmailMode()
  if (mode === 'resend') {
    const resendConfig = getResendConfig()
    if (!resendConfig) {
      const message = 'Resend transport is selected but RESEND_API_KEY is missing.'
      if (strict) throw new Error(message)
      logger.warn?.(`[email] ${message}`)
      return { ok: false, mode, message }
    }

    try {
      /* Try /domains as a health check. Send-only API keys lack permission
       * for this endpoint — treat 403 as "key is valid, just restricted". */
      const response = await fetch(`${resendConfig.baseUrl}/domains`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${resendConfig.apiKey}`,
        },
      })

      const isRestrictedKey =
        !response.ok && (await parseJsonSafely(response.clone()))?.name === 'restricted_api_key'
      if (response.ok || isRestrictedKey) {
        logger.info?.('[email] transport ready (resend)')
        return { ok: true, mode }
      }

      const responsePayload = await parseJsonSafely(response)
      const errorMessage =
        responsePayload?.message ||
        responsePayload?.error ||
        `${response.status} ${response.statusText}`.trim()
      throw new Error(`Resend API validation failed: ${errorMessage}`)
    } catch (error) {
      const message = `Email transport validation failed (${mode}): ${error.message}`
      if (strict) throw new Error(message)
      logger.error?.(`[email] ${message}`)
      return { ok: false, mode, message }
    }
  }

  const transporter = getTransporter(mode)

  if (!transporter) {
    const message =
      'Email delivery is not configured. Configure Resend (EMAIL_TRANSPORT=resend + RESEND_API_KEY), SMTP, or EMAIL_TRANSPORT=json.'
    if (strict) throw new Error(message)
    logger.warn?.(`[email] ${message}`)
    return { ok: false, mode, message }
  }

  try {
    if (typeof transporter.verify === 'function' && mode !== 'json') {
      await transporter.verify()
    }

    logger.info?.(`[email] transport ready (${mode})`)
    return { ok: true, mode }
  } catch (error) {
    const message = `Email transport validation failed (${mode}): ${error.message}`
    if (strict) throw new Error(message)
    logger.error?.(`[email] ${message}`)
    return { ok: false, mode, message }
  }
}

async function captureEmail(mailOptions, result, kind) {
  const captureDir = process.env.EMAIL_CAPTURE_DIR
  if (!captureDir) return

  const safeKind = String(kind || 'email')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .toLowerCase()
  const safeRecipient = String(mailOptions.to || 'unknown')
    .replace(/[^a-z0-9@._-]+/gi, '-')
    .toLowerCase()
  const fileName = `${Date.now()}-${safeKind}-${safeRecipient}.json`
  const payload = {
    kind: safeKind,
    to: mailOptions.to,
    subject: mailOptions.subject,
    text: mailOptions.text || '',
    html: mailOptions.html || '',
    messageId: result?.messageId || null,
    accepted: result?.accepted || [],
    rejected: result?.rejected || [],
  }

  await fs.mkdir(captureDir, { recursive: true })
  await fs.writeFile(
    path.join(captureDir, fileName),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  )
}

async function deliverMail(mailOptions, kind) {
  await assertRecipientsAllowed(mailOptions.to)

  const mode = getEmailMode()

  let result
  if (mode === 'resend') {
    result = await sendWithResend(mailOptions)
  } else {
    const transporter = getTransporter(mode)
    if (!transporter) {
      throw new Error(
        'Email delivery is not configured. Configure Resend (EMAIL_TRANSPORT=resend + RESEND_API_KEY), SMTP, or EMAIL_TRANSPORT=json.',
      )
    }

    result = await transporter.sendMail(mailOptions)
  }

  await captureEmail(mailOptions, result, kind)
  return result
}

module.exports = {
  getPublicAppUrl,
  escapeHtml,
  getFromAddress,
  getAdminEmail,
  getEmailMode,
  deliverMail,
  validateEmailTransport,
}
