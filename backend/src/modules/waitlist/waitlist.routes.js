/**
 * waitlist.routes.js — Public waitlist signup endpoint.
 *
 * Mounted at /api/waitlist in index.js. Handles signup with:
 *   - Confirmation email (fire-and-forget)
 *   - In-app notification if the caller is logged in
 */
const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const { writeLimiter } = require('../../lib/rateLimiters')
const { addToWaitlist } = require('./waitlist.service')

const router = express.Router()

// Optional auth — check if the user is logged in but don't require it.
// We use the same pattern as optionalAuth: try to parse the JWT, set
// req.user if valid, continue regardless.
let optionalAuth
try {
  optionalAuth = require('../../core/auth/optionalAuth')
} catch (err) {
  // Only swallow MODULE_NOT_FOUND for the exact path — re-throw real errors
  if (err && err.code === 'MODULE_NOT_FOUND') {
    optionalAuth = (_req, _res, next) => next()
  } else {
    throw err
  }
}

/**
 * POST /api/waitlist
 */
router.post('/', writeLimiter, optionalAuth, async (req, res) => {
  try {
    const { email, tier } = req.body || {}
    const entry = await addToWaitlist({ email, tier })

    // 0.1: Confirmation email (fire-and-forget — never blocks the response)
    try {
      const { deliverMail } = require('../../lib/email/emailTransport')
      const { escapeHtml, getFromAddress } = require('../../lib/email/emailValidation')

      // Import htmlWrap from emailTemplates
      let htmlWrap
      try {
        const templates = require('../../lib/email/emailTemplates')
        htmlWrap =
          templates.htmlWrap ||
          ((title, body) => `<html><head><title>${title}</title></head><body>${body}</body></html>`)
      } catch {
        htmlWrap = (title, body) =>
          `<html><head><title>${title}</title></head><body>${body}</body></html>`
      }

      const isInstitution = tier === 'institution'
      const tierLabel = isInstitution ? 'Institution' : 'Pro'
      const personalNote = isInstitution
        ? "We will reach out to discuss your institution's specific needs and how StudyHub can support your students and faculty."
        : 'You will be among the first to access Pro features when we launch, including unlimited uploads, advanced AI, and priority support.'

      void deliverMail(
        {
          from: `"StudyHub" <${getFromAddress()}>`,
          to: email.trim().toLowerCase(),
          subject: `You're on the StudyHub ${tierLabel} waitlist`,
          text: [
            `Thank you for joining the StudyHub ${tierLabel} waitlist!`,
            '',
            personalNote,
            '',
            'We are working hard to bring these features to you soon.',
            '',
            '— The StudyHub Team',
          ].join('\n'),
          html: htmlWrap(
            `StudyHub ${tierLabel} Waitlist`,
            `
          <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;">You're on the list</h2>
          <p style="margin:0 0 16px;color:#6b7280;font-size:15px;">
            Thank you for joining the StudyHub <strong>${escapeHtml(tierLabel)}</strong> waitlist.
          </p>
          <div style="background:#f0f4f8;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
            <p style="margin:0 0 6px;color:#334155;font-size:14px;"><strong>Tier:</strong> ${escapeHtml(tierLabel)}</p>
            <p style="margin:0;color:#334155;font-size:14px;">${escapeHtml(personalNote)}</p>
          </div>
          <p style="margin:0;color:#6b7280;font-size:14px;">
            We are working hard to bring these features to you soon. Stay tuned!
          </p>
        `,
          ),
        },
        'waitlist-confirmation',
      ).catch((emailErr) => {
        // Don't ship raw email to Sentry — PII compliance. Log the
        // entry id so we can join back to the row if we need to.
        captureError(emailErr, { location: 'waitlist/confirmationEmail', entryId: entry.id })
      })
    } catch (emailSetupErr) {
      // Email infra missing or misconfigured — log but don't block signup
      captureError(emailSetupErr, { location: 'waitlist/emailSetup' })
    }

    // 0.2: In-app notification if the caller is logged in
    if (req.user?.userId) {
      try {
        const { createNotification } = require('../../lib/notify')
        await createNotification(require('../../lib/prisma'), {
          userId: req.user.userId,
          type: 'waitlist_joined',
          message: `You joined the ${tier === 'institution' ? 'Institution' : 'Pro'} waitlist. We will notify you when it launches.`,
          linkPath: '/pricing',
          priority: 'low',
        })
      } catch (notifErr) {
        // Non-fatal
        captureError(notifErr, { location: 'waitlist/notification' })
      }
    }

    res.status(201).json({ message: 'You have been added to the waitlist.' })
  } catch (err) {
    if (err.status === 409) {
      // Duplicate — still 200 so the user doesn't see an error
      return res.json({ message: 'You are already on the waitlist.' })
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})

module.exports = router
