const {
  getPublicAppUrl,
  escapeHtml,
  getFromAddress,
  getAdminEmail,
  getEmailMode,
  deliverMail,
} = require('./emailTransport')

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
    <div style="background:#f0f4f8;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
      <p style="margin:0;color:#6b7280;font-size:13px;">Your username</p>
      <p style="margin:4px 0 0;color:#1e3a5f;font-size:18px;font-weight:bold;letter-spacing:0.5px;">${escapeHtml(username)}</p>
    </div>
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
      `Your StudyHub username: ${username}`,
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

async function sendHighRiskSheetAlert({ sheetId, sheetTitle, username, flags }) {
  const adminEmail = getAdminEmail()
  if (!adminEmail) {
    console.warn('[email] ADMIN_EMAIL not set — skipping high-risk sheet alert')
    return
  }

  const flagList = (flags || []).map((f) => `<li style="color:#991b1b;font-size:13px;">${escapeHtml(f)}</li>`).join('')

  const body = `
    <h2 style="margin:0 0 8px;color:#991b1b;font-size:22px;">High-Risk HTML Sheet Flagged</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      An HTML sheet was automatically flagged during submission and set to pending review.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Sheet ID:</strong> ${escapeHtml(sheetId)}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Title:</strong> ${escapeHtml(sheetTitle || 'Untitled')}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Author:</strong> ${escapeHtml(username || 'Unknown')}</p>
      <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Flags:</strong></p>
      <ul style="margin:4px 0 0;padding-left:18px;">${flagList}</ul>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">
      Review this sheet from the admin dashboard before approving.
    </p>
  `

  const mailOptions = {
    from: `"StudyHub" <${getFromAddress()}>`,
    to: adminEmail,
    subject: `High-risk HTML sheet flagged: ${sheetTitle || `Sheet #${sheetId}`}`,
    text: [
      'An HTML sheet was automatically flagged during submission.',
      '',
      `Sheet ID: ${sheetId}`,
      `Title: ${sheetTitle || 'Untitled'}`,
      `Author: ${username || 'Unknown'}`,
      `Flags: ${(flags || []).join(', ')}`,
      '',
      'Review this sheet from the admin dashboard before approving.',
    ].join('\n'),
    html: htmlWrap('High-Risk Sheet Alert', body),
  }

  await deliverMail(mailOptions, 'high-risk-sheet')
}

module.exports = {
  sendEmailSmoke,
  sendPasswordReset,
  sendEmailVerification,
  sendCourseRequestNotice,
  sendHighRiskSheetAlert,
}
