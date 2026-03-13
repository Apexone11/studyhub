const express     = require('express')
const { PrismaClient } = require('@prisma/client')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')

const router = express.Router()
const prisma  = new PrismaClient()

// ── GET all sheets (with optional filters) ────────────────────
router.get('/', async (req, res) => {
  const {
    courseId, schoolId, search,
    limit   = 20,
    offset  = 0,
    orderBy = 'createdAt',   // 'createdAt' | 'stars' | 'downloads'
  } = req.query

  try {
    const where = {}

    if (courseId) where.courseId = parseInt(courseId)
    if (schoolId) where.course   = { schoolId: parseInt(schoolId) }
    if (search)   where.title    = { contains: search, mode: 'insensitive' }

    // safe sort whitelist — never pass raw user input to Prisma
    const ALLOWED_SORT = ['createdAt', 'stars', 'downloads', 'forks']
    const sortField = ALLOWED_SORT.includes(orderBy) ? orderBy : 'createdAt'

    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
        orderBy: { [sortField]: 'desc' },
        take:    parseInt(limit),
        skip:    parseInt(offset),
      }),
      prisma.studySheet.count({ where }),
    ])

    res.json({ sheets, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET single sheet ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const sheet = await prisma.studySheet.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } }
      }
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    res.json(sheet)
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    res.status(500).json({ error: 'Server error.' })
  }
})

// ── CREATE a sheet ────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { title, content, courseId, forkOf } = req.body

  if (!title?.trim())   return res.status(400).json({ error: 'Title is required.' })
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' })
  if (!courseId)        return res.status(400).json({ error: 'Course is required.' })

  try {
    const sheet = await prisma.studySheet.create({
      data: {
        title:    title.trim(),
        content:  content.trim(),
        courseId: parseInt(courseId),
        userId:   req.user.userId,
        forkOf:   forkOf ? parseInt(forkOf) : null,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } }
      }
    })
    res.status(201).json(sheet)
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── FORK a sheet ──────────────────────────────────────────────
router.post('/:id/fork', requireAuth, async (req, res) => {
  try {
    const original = await prisma.studySheet.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { course: true },
    })
    if (!original) return res.status(404).json({ error: 'Sheet not found.' })

    // allow custom title from body, fallback to "(fork)" suffix
    const { title } = req.body
    const forkTitle  = title?.trim() || `${original.title} (fork)`

    const forked = await prisma.studySheet.create({
      data: {
        title:    forkTitle,
        content:  original.content,
        courseId: original.courseId,
        userId:   req.user.userId,
        forkOf:   original.id,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
      },
    })

    // increment fork count on the original
    await prisma.studySheet.update({
      where: { id: original.id },
      data:  { forks: { increment: 1 } },
    })

    res.status(201).json(forked)
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── STAR a sheet ──────────────────────────────────────────────
// NOTE: This always increments. Per-user star deduplication (to allow
// toggling) will require a separate UserStar join table once added.
router.post('/:id/star', requireAuth, async (req, res) => {
  try {
    const sheet = await prisma.studySheet.update({
      where: { id: parseInt(req.params.id) },
      data:  { stars: { increment: 1 } }
    })
    res.json({ stars: sheet.stars })
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DOWNLOAD count ────────────────────────────────────────────
router.post('/:id/download', async (req, res) => {
  try {
    const sheet = await prisma.studySheet.update({
      where: { id: parseInt(req.params.id) },
      data:  { downloads: { increment: 1 } }
    })
    res.json({ downloads: sheet.downloads })
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE a sheet (author only) ──────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: parseInt(req.params.id) }
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your sheet.' })
    }
    await prisma.studySheet.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Sheet deleted.' })
  } catch (err) {
    captureError(err, {
      route: req.originalUrl,
      method: req.method
    })

    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router