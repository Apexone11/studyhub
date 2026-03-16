const express = require('express')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')

const router = express.Router()

const mutateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// All note routes require auth
router.use(requireAuth)

// ── GET /api/notes ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { q, courseId, private: priv } = req.query
  try {
    const where = { userId: req.user.userId }
    if (q) where.title = { contains: q, mode: 'insensitive' }
    if (courseId) where.courseId = parseInt(courseId)
    if (priv !== undefined) where.private = priv === 'true'

    const notes = await prisma.note.findMany({
      where,
      include: { course: { select: { id: true, code: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(notes)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/notes ────────────────────────────────────────────
router.post('/', mutateLimiter, async (req, res) => {
  const { title, content, courseId, private: priv } = req.body || {}
  const trimmedTitle = typeof title === 'string' ? title.trim() : ''

  if (!trimmedTitle) return res.status(400).json({ error: 'Title is required.' })
  if (trimmedTitle.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' })

  try {
    const note = await prisma.note.create({
      data: {
        title: trimmedTitle,
        content: typeof content === 'string' ? content : '',
        userId: req.user.userId,
        courseId: courseId ? parseInt(courseId) : null,
        private: priv !== false,
      },
      include: { course: { select: { id: true, code: true } } },
    })
    res.status(201).json(note)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/notes/:id ───────────────────────────────────────
router.patch('/:id', mutateLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id)
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (note.userId !== req.user.userId) return res.status(403).json({ error: 'Not your note.' })

    const { title, content, courseId, private: priv } = req.body || {}
    const data = {}
    if (title !== undefined) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : ''
      if (!trimmedTitle) return res.status(400).json({ error: 'Title cannot be empty.' })
      if (trimmedTitle.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' })
      data.title = trimmedTitle
    }
    if (content !== undefined) data.content = typeof content === 'string' ? content : ''
    if (courseId !== undefined) data.courseId = courseId ? parseInt(courseId) : null
    if (priv !== undefined) data.private = Boolean(priv)

    const updated = await prisma.note.update({
      where: { id: noteId },
      data,
      include: { course: { select: { id: true, code: true } } },
    })
    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/notes/:id ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const noteId = parseInt(req.params.id)
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (note.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your note.' })
    }
    await prisma.note.delete({ where: { id: noteId } })
    res.json({ message: 'Note deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
