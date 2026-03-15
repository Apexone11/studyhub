const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')

const router = express.Router()
const prisma = new PrismaClient()

// ── Directory setup ───────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../../uploads')
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars')
const ATTACHMENTS_DIR = path.join(UPLOADS_DIR, 'attachments')

;[UPLOADS_DIR, AVATARS_DIR, ATTACHMENTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

// ── Allowed types ─────────────────────────────────────────────
const AVATAR_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const AVATAR_ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const AVATAR_MAX_BYTES    = 2 * 1024 * 1024   // 2 MB

const ATTACHMENT_ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const ATTACHMENT_ALLOWED_EXT  = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'])
const ATTACHMENT_MAX_BYTES    = 10 * 1024 * 1024  // 10 MB

// ── Safe filename: strip to alphanumeric + dash/dot ───────────
function safeName(original) {
  const ext = path.extname(original).toLowerCase()
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return `${base}-${Date.now()}${ext}`
}

// ── Avatar upload ─────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => cb(null, `user-${req.user.userId}-${safeName(file.originalname)}`),
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!AVATAR_ALLOWED_MIME.has(file.mimetype) || !AVATAR_ALLOWED_EXT.has(ext)) {
      return cb(new Error('Avatar must be a JPEG, PNG, WebP, or GIF image.'))
    }
    cb(null, true)
  },
})

// POST /api/upload/avatar
router.post('/avatar', requireAuth, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Avatar must be 2 MB or smaller.' })
    }
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    try {
      // Delete old avatar file if it exists locally
      const oldUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { avatarUrl: true },
      })
      if (oldUser?.avatarUrl && oldUser.avatarUrl.startsWith('/uploads/avatars/')) {
        const oldPath = path.join(UPLOADS_DIR, oldUser.avatarUrl.replace('/uploads/', ''))
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`
      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: { avatarUrl },
        select: { id: true, username: true, role: true, avatarUrl: true },
      })
      res.json({ avatarUrl: user.avatarUrl })
    } catch (dbErr) {
      captureError(dbErr, { route: req.originalUrl })
      res.status(500).json({ error: 'Failed to save avatar.' })
    }
  })
})

// ── Sheet attachment upload ───────────────────────────────────
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACHMENTS_DIR),
  filename: (req, file, cb) => cb(null, `sheet-${safeName(file.originalname)}`),
})

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ATTACHMENT_ALLOWED_MIME.has(file.mimetype) || !ATTACHMENT_ALLOWED_EXT.has(ext)) {
      return cb(new Error('Attachment must be a PDF or image (JPEG, PNG, GIF, WebP).'))
    }
    cb(null, true)
  },
})

// POST /api/upload/attachment/:sheetId
router.post('/attachment/:sheetId', requireAuth, (req, res) => {
  attachmentUpload.single('attachment')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Attachment must be 10 MB or smaller.' })
    }
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    const sheetId = parseInt(req.params.sheetId)
    try {
      const sheet = await prisma.studySheet.findUnique({
        where: { id: sheetId },
        select: { id: true, userId: true, attachmentUrl: true },
      })
      if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
      if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
        // Delete the just-uploaded file to avoid orphaned files
        fs.unlinkSync(req.file.path)
        return res.status(403).json({ error: 'Not your sheet.' })
      }

      // Delete old attachment if present locally
      if (sheet.attachmentUrl && sheet.attachmentUrl.startsWith('/uploads/attachments/')) {
        const oldPath = path.join(UPLOADS_DIR, sheet.attachmentUrl.replace('/uploads/', ''))
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
      }

      const ext = path.extname(req.file.filename).toLowerCase()
      const attachmentType = ext === '.pdf' ? 'pdf' : 'image'
      const attachmentUrl = `/uploads/attachments/${req.file.filename}`

      const updated = await prisma.studySheet.update({
        where: { id: sheetId },
        data: { attachmentUrl, attachmentType },
        select: { id: true, attachmentUrl: true, attachmentType: true },
      })
      res.json(updated)
    } catch (dbErr) {
      captureError(dbErr, { route: req.originalUrl })
      res.status(500).json({ error: 'Failed to save attachment.' })
    }
  })
})

module.exports = router
