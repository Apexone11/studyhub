const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const {
  isHtmlUploadsEnabled,
  setHtmlUploadsEnabled,
  readEnvOverride,
} = require('../../lib/html/htmlKillSwitch')
const prisma = require('../../lib/prisma')
const { PAGE_SIZE, parsePage } = require('./admin.constants')

const router = express.Router()

// ── GET /api/admin/announcements ─────────────────────────────
router.get('/announcements', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        include: { author: { select: { id: true, username: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.announcement.count(),
    ])
    res.json({ announcements, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/admin/announcements ────────────────────────────
router.post('/announcements', async (req, res) => {
  const { title, body, pinned } = req.body || {}
  if (!title?.trim() || !body?.trim())
    return res.status(400).json({ error: 'Title and body are required.' })
  try {
    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim().slice(0, 200),
        body: body.trim().slice(0, 25000),
        authorId: req.user.userId,
        pinned: Boolean(pinned),
      },
      include: { author: { select: { id: true, username: true } } },
    })
    res.status(201).json(announcement)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/announcements/:id/pin ───────────────────
router.patch('/announcements/:id/pin', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid announcement id.' })
    }
    const current = await prisma.announcement.findUnique({ where: { id } })
    if (!current) return res.status(404).json({ error: 'Announcement not found.' })
    const updated = await prisma.announcement.update({
      where: { id: current.id },
      data: { pinned: !current.pinned },
      include: { author: { select: { id: true, username: true } } },
    })
    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/announcements/:id ──────────────────────
router.delete('/announcements/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid announcement id.' })
    }
    await prisma.announcement.delete({ where: { id } })
    res.json({ message: 'Announcement deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Announcement not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/settings/html-uploads ─────────────────────
router.get('/settings/html-uploads', async (req, res) => {
  try {
    const status = await isHtmlUploadsEnabled()
    const envOverride = readEnvOverride()
    res.json({
      enabled: status.enabled,
      source: status.source,
      envOverride,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/settings/html-uploads ────────────────────
router.patch('/settings/html-uploads', async (req, res) => {
  const enabled = req.body?.enabled
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '"enabled" must be a boolean.' })
  }

  try {
    const result = await setHtmlUploadsEnabled(enabled, {
      adminUserId: req.user.userId,
    })

    const envLocked = result.envOverride != null
    res.json({
      enabled: result.enabled,
      dbValue: result.dbValue,
      source: result.source,
      envOverride: result.envOverride,
      message: envLocked
        ? `Database updated, but the STUDYHUB_HTML_UPLOADS env var ("${result.envOverride}") overrides the toggle.`
        : `HTML uploads ${result.enabled ? 'enabled' : 'disabled'}.`,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
