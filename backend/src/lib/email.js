const fs = require('node:fs/promises')
const path = require('node:path')
const nodemailer = require('nodemailer')
const prisma = require('./prisma')
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
  return (process.env.ADMIN_EMAIL || process.env.EMAIL_USER || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
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
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) return process.env.EMAIL_HOST ? 'smtp-host' : 'provider'
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
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  }

  const single = String(value || '').trim()
  return single ? [single] : []
}

function normalizeRecipientLookupEmail(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

function getRecipientLookupEmails(value) {
  const recipients = normalizeEmailRecipients(value)
  if (recipients.length === 0) return []

  return [...new Set(recipients
    .map((recipient) => normalizeRecipientLookupEmail(recipient))
    .filter(Boolean))]
}

async function getSuppressedRecipients(toValue) {
  const lookupEmails = getRecipientLookupEmails(toValue)
  if (lookupEmails.length === 0) return []

  try {
    return prisma.emailSuppression.findMany({
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

  const blockedAddresses = suppressedRecipients
    .map((entry) => entry.email)
    .filter(Boolean)
  const blockedReasons = [...new Set(
    suppressedRecipients
      .map((entry) => entry.reason)
      .filter(Boolean),
  )]

  const error = new Error(`Email delivery blocked for suppressed recipient(s): ${blockedAddresses.join(', ')}`)
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
    throw new Error('Resend delivery is not configured. Set RESEND_API_KEY and EMAIL_TRANSPORT=resend.')
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
    const errorMessage = responsePayload?.message
      || responsePayload?.error
      || `${response.status} ${response.statusText}`.trim()
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

      const isRestrictedKey = !response.ok && (await parseJsonSafely(response.clone()))?.name === 'restricted_api_key'
      if (response.ok || isRestrictedKey) {
        logger.info?.('[email] transport ready (resend)')
        return { ok: true, mode }
      }

      const responsePayload = await parseJsonSafely(response)
      const errorMessage = responsePayload?.message
        || responsePayload?.error
        || `${response.status} ${response.statusText}`.trim()
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
    const message = 'Email delivery is not configured. Configure Resend (EMAIL_TRANSPORT=resend + RESEND_API_KEY), SMTP, or EMAIL_TRANSPORT=json.'
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

  const safeKind = String(kind || 'email').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
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
  await fs.writeFile(path.join(captureDir, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
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
      throw new Error('Email delivery is not configured. Configure Resend (EMAIL_TRANSPORT=resend + RESEND_API_KEY), SMTP, or EMAIL_TRANSPORT=json.')
    }

    result = await transporter.sendMail(mailOptions)
  }

  await captureEmail(mailOptions, result, kind)
  return result
}

async function sendEmailSmoke(toEmail = getAdminEmail()) {
  if (!toEmail) {
    throw new Error('No smoke-test recipient is configured. Set ADMIN_EMAIL or pass EMAIL_SMOKE_TO.')
  }

  const sentAt = new Date().toISOString()
  return deliverMail({
    from: `"StudyHub" <${getFromAddress()}>`,
    to: toEmail,
    subject: 'StudyHub email smoke test',
    text: [
      'This is a StudyHub email smoke test.',
      '',
      `Sent at: ${sentAt}`,
      `Mode: ${getEmailMode()}`,
    ].join('\n'),
    html: htmlWrap('StudyHub Email Smoke Test', `
      <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Email smoke test</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;">
        This message confirms that the StudyHub email transport can send mail.
      </p>
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;">
        <p style="margin:0 0 6px;color:#334155;font-size:14px;"><strong>Sent at:</strong> ${escapeHtml(sentAt)}</p>
        <p style="margin:0;color:#334155;font-size:14px;"><strong>Mode:</strong> ${escapeHtml(getEmailMode())}</p>
      </div>
    `),
  }, 'email-smoke')
}

// Shared HTML email wrapper with StudyHub branding
function htmlWrap(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:28px 40px;text-align:center;">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-right:10px;">
              <rect width="36" height="36" rx="8" fill="#3b82f6"/>
              <path d="M18 8 L18 28 M10 14 L18 8 L26 14 M10 22 L18 16 L26 22" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span style="color:#ffffff;font-size:22px;font-weight:bold;vertical-align:middle;">StudyHub</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Built by students, for students &middot;
              <a href="${getPublicAppUrl()}" style="color:#3b82f6;text-decoration:none;">StudyHub</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;">
              If you did not request this email, you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Send a password reset email.
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username (for display)
 * @param {string} resetUrl - Full reset URL with token
 */
async function sendPasswordReset(toEmail, username, resetUrl) {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Reset Your Password</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi <strong>${escapeHtml(username)}</strong>, we received a request to reset your StudyHub password.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:8px;">Reset Password</a>
    </div>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Or copy and paste this link into your browser:</p>
    <p style="margin:0 0 24px;word-break:break-all;font-size:13px;color:#3b82f6;">${escapeHtml(resetUrl)}</p>
    <p style="margin:0;color:#9ca3af;font-size:13px;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, no action is needed.</p>
  `

  await deliverMail({
    from: `"StudyHub" <${getFromAddress()}>`,
    to: toEmail,
    subject: 'Reset your StudyHub password',
    text: [
      `Hi ${username},`,
      '',
      'We received a request to reset your StudyHub password.',
      '',
      `Reset link: ${resetUrl}`,
      '',
      'This link expires in 1 hour. If you did not request a reset, you can ignore this email.',
    ].join('\n'),
    html: htmlWrap('Reset Your StudyHub Password', body),
  }, 'password-reset')
}

/**
 * Send an email verification code (for future use).
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username
 * @param {string} code     - 6-digit verification code
 */
async function sendEmailVerification(toEmail, username, code) {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Verify Your Email</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi <strong>${escapeHtml(username)}</strong>, use the code below to verify your email address.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#f0f4f8;border:2px solid #e5e7eb;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;">${escapeHtml(code)}</span>
      </div>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">This code expires in <strong>15 minutes</strong>.</p>
  `

  await deliverMail({
    from: `"StudyHub" <${getFromAddress()}>`,
    to: toEmail,
    subject: 'Verify your StudyHub email',
    text: [
      `Hi ${username},`,
      '',
      `Your StudyHub email verification code is: ${code}`,
      '',
      'This code expires in 15 minutes.',
    ].join('\n'),
    html: htmlWrap('Verify Your StudyHub Email', body),
  }, 'email-verification')
}

/**
 * Send a 2FA verification code via email.
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username
 * @param {string} code     - 6-digit 2FA code
 */
async function sendTwoFaCode(toEmail, username, code) {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Two-Step Verification</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi <strong>${escapeHtml(username)}</strong>, here is your sign-in code. It expires in 10 minutes.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#f0f4f8;border:2px solid #3b82f6;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;">${escapeHtml(code)}</span>
      </div>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">If you did not attempt to sign in, change your password immediately.</p>
  `

  await deliverMail({
    from: `"StudyHub" <${getFromAddress()}>`,
    to: toEmail,
    subject: 'Your StudyHub sign-in code',
    text: [
      `Hi ${username},`,
      '',
      `Your StudyHub sign-in code is: ${code}`,
      '',
      'It expires in 10 minutes. If you did not try to sign in, change your password immediately.',
    ].join('\n'),
    html: htmlWrap('Your StudyHub Sign-In Code', body),
  }, 'two-factor')
}

/**
 * Send a course request notification to the company/admin inbox.
 * @param {object} params
 * @param {string} params.courseName
 * @param {string | null} params.courseCode
 * @param {string | null} params.schoolName
 * @param {string} params.requesterUsername
 * @param {string | null} params.requesterEmail
 * @param {number} params.requestCount
 * @param {boolean} params.flagged
 */
async function sendCourseRequestNotice({
  courseName,
  courseCode,
  schoolName,
  requesterUsername,
  requesterEmail,
  requestCount,
  flagged,
}) {
  const adminEmail = getAdminEmail()
  if (!adminEmail) {
    console.warn('[email] ADMIN_EMAIL not set — skipping course request notification')
    return
  }

  const subject = flagged
    ? `StudyHub request flagged for review: ${courseName}`
    : `New StudyHub course request: ${courseName}`

  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Course Request Notification</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      A student submitted a new course request on StudyHub.
    </p>
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Course:</strong> ${escapeHtml(courseName)}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Code:</strong> ${escapeHtml(courseCode || 'Not provided')}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>School:</strong> ${escapeHtml(schoolName || 'Not specified')}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Requested by:</strong> ${escapeHtml(requesterUsername)}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Requester email:</strong> ${escapeHtml(requesterEmail || 'Not provided')}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Total requests:</strong> ${escapeHtml(requestCount)}</p>
      <p style="margin:0;color:#334155;font-size:14px;"><strong>Status:</strong> ${escapeHtml(flagged ? 'Flagged for review' : 'Below review threshold')}</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">
      Review this request from the admin dashboard when you are ready.
    </p>
  `

  const mailOptions = {
    from: `"StudyHub" <${getFromAddress()}>`,
    to: adminEmail,
    subject,
    text: [
      'A student submitted a new course request on StudyHub.',
      '',
      `Course: ${courseName}`,
      `Code: ${courseCode || 'Not provided'}`,
      `School: ${schoolName || 'Not specified'}`,
      `Requested by: ${requesterUsername}`,
      `Requester email: ${requesterEmail || 'Not provided'}`,
      `Total requests: ${requestCount}`,
      `Status: ${flagged ? 'Flagged for review' : 'Below review threshold'}`,
    ].join('\n'),
    html: htmlWrap('StudyHub Course Request', body),
  }

  if (requesterEmail) {
    mailOptions.replyTo = requesterEmail
  }

  await deliverMail(mailOptions, 'course-request')
}

module.exports = {
  getAdminEmail,
  sendPasswordReset,
  sendEmailVerification,
  sendTwoFaCode,
  sendCourseRequestNotice,
  sendEmailSmoke,
  validateEmailTransport,
}
