const nodemailer = require('nodemailer')

// Create transporter lazily so missing env vars don't crash on startup
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
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
              <a href="https://studyhub.up.railway.app" style="color:#3b82f6;text-decoration:none;">StudyHub</a>
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
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[email] EMAIL_USER/EMAIL_PASS not set — skipping password reset email')
    return
  }

  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Reset Your Password</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi <strong>${username}</strong>, we received a request to reset your StudyHub password.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:8px;">Reset Password</a>
    </div>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Or copy and paste this link into your browser:</p>
    <p style="margin:0 0 24px;word-break:break-all;font-size:13px;color:#3b82f6;">${resetUrl}</p>
    <p style="margin:0;color:#9ca3af;font-size:13px;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, no action is needed.</p>
  `

  await transporter.sendMail({
    from: `"StudyHub" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset your StudyHub password',
    html: htmlWrap('Reset Your StudyHub Password', body),
  })
}

/**
 * Send an email verification code (for future use).
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username
 * @param {string} code     - 6-digit verification code
 */
async function sendEmailVerification(toEmail, username, code) {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[email] EMAIL_USER/EMAIL_PASS not set — skipping verification email')
    return
  }

  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Verify Your Email</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi <strong>${username}</strong>, use the code below to verify your email address.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#f0f4f8;border:2px solid #e5e7eb;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;">${code}</span>
      </div>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">This code expires in <strong>15 minutes</strong>.</p>
  `

  await transporter.sendMail({
    from: `"StudyHub" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your StudyHub email',
    html: htmlWrap('Verify Your StudyHub Email', body),
  })
}

/**
 * Send a 2FA verification code via email.
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username
 * @param {string} code     - 6-digit 2FA code
 */
async function sendTwoFaCode(toEmail, username, code) {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[email] EMAIL_USER/EMAIL_PASS not set — skipping 2FA email')
    return
  }

  const body = `
    <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">Two-Step Verification</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi <strong>${username}</strong>, here is your sign-in code. It expires in 10 minutes.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#f0f4f8;border:2px solid #3b82f6;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;">${code}</span>
      </div>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">If you did not attempt to sign in, change your password immediately.</p>
  `

  await transporter.sendMail({
    from: `"StudyHub" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your StudyHub sign-in code',
    html: htmlWrap('Your StudyHub Sign-In Code', body),
  })
}

module.exports = { sendPasswordReset, sendEmailVerification, sendTwoFaCode }
