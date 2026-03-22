const express = require('express')
const multer = require('multer')
const path = require('path')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../../middleware/auth')
const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { captureError } = require('../../monitoring/sentry')
const { signatureMatchesExpected, validateMagicBytes } = require('../../lib/fileSignatures')
const prisma = require('../../lib/prisma')
const {
  ATTACHMENTS_DIR,
  AVATARS_DIR,
  buildAttachmentUrl,
  buildAvatarUrl,
  cleanupAttachmentIfUnused,
  cleanupAvatarIfUnused,
  safeUnlinkFile,
} = require('../../lib/storage')

const router = express.Router()

// ── Allowed types ─────────────────────────────────────────────
const AVATAR_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const AVATAR_ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const AVATAR_MAX_BYTES    = 5 * 1024 * 1024   // 5 MB

const ATTACHMENT_ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const ATTACHMENT_ALLOWED_EXT  = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'])
const ATTACHMENT_MAX_BYTES    = 10 * 1024 * 1024  // 10 MB

const avatarUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many avatar uploads. Please wait a bit.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const attachmentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { error: 'Too many attachment uploads. Please wait a bit.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── Safe filename: strip to alphanumeric + dash/dot ───────────
function safeName(original) {
  const ext = path.extname(original).toLowerCase()
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return `${base}-${Date.now()}${ext}`
}

function safeAttachmentLabel(original) {
  return path.basename(String(original || 'attachment'))
    .replace(/[^a-zA-Z0-9._() -]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

function rejectSignatureMismatch(res, file, message) {
  safeUnlinkFile(file?.path)
  return sendError(res, 400, message, ERROR_CODES.UPLOAD_SIGNATURE_MISMATCH)
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
router.post('/avatar', requireAuth, avatarUploadLimiter, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 400, 'Avatar must be 5 MB or smaller.', ERROR_CODES.UPLOAD_INVALID)
    }
    if (err) return sendError(res, 400, err.message, ERROR_CODES.UPLOAD_INVALID)
    if (!req.file) return sendError(res, 400, 'No file uploaded.', ERROR_CODES.UPLOAD_MISSING_FILE)
    if (!signatureMatchesExpected(req.file.path, Array.from(AVATAR_ALLOWED_MIME)).ok) {
      return rejectSignatureMismatch(res, req.file, 'Avatar contents do not match a supported image format.')
    }
    const avatarMagic = validateMagicBytes(req.file.path, req.file.mimetype)
    if (!avatarMagic.valid) {
      return rejectSignatureMismatch(res, req.file,
        `Avatar file signature does not match declared type (detected: ${avatarMagic.detectedType || 'unknown'}, declared: ${avatarMagic.declaredType}).`)
    }

    try {
      // Delete old avatar file if it exists locally
      const oldUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { avatarUrl: true },
      })

      const avatarUrl = buildAvatarUrl(req.file.filename)
      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: { avatarUrl },
        select: { id: true, username: true, role: true, avatarUrl: true },
      })

      await cleanupAvatarIfUnused(prisma, oldUser?.avatarUrl, {
        route: req.originalUrl,
        userId: req.user.userId,
      })

      res.json({ avatarUrl: user.avatarUrl })
    } catch (dbErr) {
      safeUnlinkFile(req.file?.path)
      captureError(dbErr, { route: req.originalUrl })
      return sendError(res, 500, 'Failed to save avatar.', ERROR_CODES.UPLOAD_SAVE_FAILED)
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
router.post('/attachment/:sheetId', requireAuth, attachmentUploadLimiter, (req, res) => {
  attachmentUpload.single('attachment')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 400, 'Attachment must be 10 MB or smaller.', ERROR_CODES.UPLOAD_INVALID)
    }
    if (err) return sendError(res, 400, err.message, ERROR_CODES.UPLOAD_INVALID)
    if (!req.file) return sendError(res, 400, 'No file uploaded.', ERROR_CODES.UPLOAD_MISSING_FILE)
    if (!signatureMatchesExpected(req.file.path, Array.from(ATTACHMENT_ALLOWED_MIME)).ok) {
      return rejectSignatureMismatch(res, req.file, 'Attachment contents do not match a supported PDF or image format.')
    }
    const sheetMagic = validateMagicBytes(req.file.path, req.file.mimetype)
    if (!sheetMagic.valid) {
      return rejectSignatureMismatch(res, req.file,
        `Attachment file signature does not match declared type (detected: ${sheetMagic.detectedType || 'unknown'}, declared: ${sheetMagic.declaredType}).`)
    }

    const sheetId = Number.parseInt(req.params.sheetId, 10)
    try {
      const sheet = await prisma.studySheet.findUnique({
        where: { id: sheetId },
        select: { id: true, userId: true, attachmentUrl: true },
      })
      if (!sheet) {
        safeUnlinkFile(req.file.path)
        return res.status(404).json({ error: 'Sheet not found.' })
      }
      if (!assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: sheet.userId,
        message: 'Not your sheet.',
        targetType: 'sheet',
        targetId: sheetId,
      })) {
        // Delete the just-uploaded file to avoid orphaned files
        safeUnlinkFile(req.file.path)
        return
      }

      const ext = path.extname(req.file.filename).toLowerCase()
      const attachmentType = ext === '.pdf' ? 'pdf' : 'image'
      const attachmentUrl = buildAttachmentUrl(req.file.filename)
      const attachmentName = safeAttachmentLabel(req.file.originalname)

      const updated = await prisma.studySheet.update({
        where: { id: sheetId },
        data: { attachmentUrl, attachmentType, attachmentName },
        select: { id: true, attachmentUrl: true, attachmentType: true, attachmentName: true },
      })

      await cleanupAttachmentIfUnused(prisma, sheet.attachmentUrl, {
        route: req.originalUrl,
        sheetId,
      })

      res.json(updated)
    } catch (dbErr) {
      safeUnlinkFile(req.file?.path)
      captureError(dbErr, { route: req.originalUrl })
      return sendError(res, 500, 'Failed to save attachment.', ERROR_CODES.UPLOAD_SAVE_FAILED)
    }
  })
})

// POST /api/upload/post-attachment/:postId
router.post('/post-attachment/:postId', requireAuth, attachmentUploadLimiter, (req, res) => {
  attachmentUpload.single('attachment')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 400, 'Attachment must be 10 MB or smaller.', ERROR_CODES.UPLOAD_INVALID)
    }
    if (err) return sendError(res, 400, err.message, ERROR_CODES.UPLOAD_INVALID)
    if (!req.file) return sendError(res, 400, 'No file uploaded.', ERROR_CODES.UPLOAD_MISSING_FILE)
    if (!signatureMatchesExpected(req.file.path, Array.from(ATTACHMENT_ALLOWED_MIME)).ok) {
      return rejectSignatureMismatch(res, req.file, 'Attachment contents do not match a supported PDF or image format.')
    }
    const postMagic = validateMagicBytes(req.file.path, req.file.mimetype)
    if (!postMagic.valid) {
      return rejectSignatureMismatch(res, req.file,
        `Attachment file signature does not match declared type (detected: ${postMagic.detectedType || 'unknown'}, declared: ${postMagic.declaredType}).`)
    }

    const postId = Number.parseInt(req.params.postId, 10)
    try {
      const post = await prisma.feedPost.findUnique({
        where: { id: postId },
        select: { id: true, userId: true, attachmentUrl: true },
      })
      if (!post) {
        safeUnlinkFile(req.file.path)
        return res.status(404).json({ error: 'Post not found.' })
      }
      if (!assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: post.userId,
        message: 'Not your post.',
        targetType: 'feed-post',
        targetId: postId,
      })) {
        safeUnlinkFile(req.file.path)
        return
      }

      const ext = path.extname(req.file.filename).toLowerCase()
      const attachmentType = ext === '.pdf' ? 'pdf' : 'image'
      const attachmentUrl = buildAttachmentUrl(req.file.filename)
      const attachmentName = safeAttachmentLabel(req.file.originalname)

      const updated = await prisma.feedPost.update({
        where: { id: postId },
        data: { attachmentUrl, attachmentType, attachmentName },
        select: { id: true, attachmentUrl: true, attachmentType: true, attachmentName: true },
      })

      await cleanupAttachmentIfUnused(prisma, post.attachmentUrl, {
        route: req.originalUrl,
        postId,
      })

      res.json(updated)
    } catch (dbErr) {
      safeUnlinkFile(req.file?.path)
      captureError(dbErr, { route: req.originalUrl })
      return sendError(res, 500, 'Failed to save attachment.', ERROR_CODES.UPLOAD_SAVE_FAILED)
    }
  })
})

module.exports = router
