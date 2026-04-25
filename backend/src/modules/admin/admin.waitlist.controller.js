/**
 * admin.waitlist.controller.js — Phase 0 admin waitlist endpoints.
 *
 * All routes run behind requireAuth + requireAdmin (from admin.routes.js).
 *
 * Endpoints:
 *   GET    /api/admin/waitlist        — paginated list with filters
 *   GET    /api/admin/waitlist/stats  — aggregate stats
 *   POST   /api/admin/waitlist/export — CSV download
 *   POST   /api/admin/waitlist/invite — invite one entry
 *   POST   /api/admin/waitlist/invite-batch — invite N entries by tier
 *   DELETE /api/admin/waitlist/:id    — remove an entry
 */
const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const waitlistService = require('../waitlist/waitlist.service')

const router = express.Router()

/**
 * GET /api/admin/waitlist
 * Query: status, tier, search, limit, offset
 */
router.get('/waitlist', async (req, res) => {
  try {
    const { status, tier, search, limit, offset } = req.query
    const result = await waitlistService.listWaitlist({
      status,
      tier,
      search,
      limit: Math.min(Number.parseInt(limit, 10) || 50, 100),
      offset: Math.max(Number.parseInt(offset, 10) || 0, 0),
    })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/admin/waitlist/stats
 */
router.get('/waitlist/stats', async (req, res) => {
  try {
    const stats = await waitlistService.getWaitlistStats()
    res.json(stats)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/admin/waitlist/export
 * Returns CSV as a file download.
 */
router.post('/waitlist/export', async (req, res) => {
  try {
    const entries = await waitlistService.exportWaitlist()

    const header = 'email,tier,status,signed_up,invited_at'
    const rows = entries.map((e) => {
      const signup = e.createdAt ? new Date(e.createdAt).toISOString() : ''
      const invited = e.invitedAt ? new Date(e.invitedAt).toISOString() : ''
      return `${escapeCsv(e.email)},${e.tier},${e.status},${signup},${invited}`
    })

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="studyhub-waitlist.csv"')
    res.send([header, ...rows].join('\n'))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/admin/waitlist/invite
 * Body: { id: number }
 */
router.post('/waitlist/invite', async (req, res) => {
  try {
    const id = Number.parseInt(req.body?.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' })

    const entry = await waitlistService.inviteEntry(id)

    // Fire-and-forget invitation email
    try {
      const { deliverMail } = require('../../lib/email/emailTransport')
      const { getFromAddress } = require('../../lib/email/emailValidation')

      void deliverMail(
        {
          from: `"StudyHub" <${getFromAddress()}>`,
          to: entry.email,
          subject: 'Your StudyHub invitation is ready',
          text: [
            'Great news! Your spot on StudyHub is ready.',
            '',
            `You were on the ${entry.tier === 'institution' ? 'Institution' : 'Pro'} waitlist, and we are excited to invite you.`,
            '',
            'Visit https://getstudyhub.org to get started.',
            '',
            '— The StudyHub Team',
          ].join('\n'),
        },
        'waitlist-invitation',
      ).catch(() => {})
    } catch {
      // Email infra missing — log and continue
    }

    res.json({ message: 'Invitation sent.', entry })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/admin/waitlist/invite-batch
 * Body: { tier: 'pro' | 'institution', count?: number }
 */
router.post('/waitlist/invite-batch', async (req, res) => {
  try {
    const { tier, count } = req.body || {}
    const result = await waitlistService.inviteBatch({
      tier,
      count: Number.parseInt(count, 10) || 50,
    })
    res.json({ message: `${result.invited} invitations sent.`, ...result })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/admin/waitlist/:id
 */
router.delete('/waitlist/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' })
    await waitlistService.removeEntry(id)
    res.json({ message: 'Entry removed.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// CSV formula injection defense (same as payments export)
function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

module.exports = router
