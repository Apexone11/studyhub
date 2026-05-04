/**
 * attachments.routes.js — Hub AI v2 document upload endpoints.
 *
 * Routes:
 *   POST   /api/ai/attachments       — upload a single file (multer + R2 + parse)
 *   GET    /api/ai/attachments       — list user's attachments
 *   DELETE /api/ai/attachments/:id   — soft-delete (sweeper later hard-deletes R2)
 *   POST   /api/ai/attachments/:id/pin — extend retention up to per-plan max
 *
 * All write routes apply originAllowlist + a dedicated rate limiter
 * keyed on req.user.userId (CLAUDE.md A7, A11). All ID validation
 * uses Number.parseInt + Number.isInteger (A12). All error responses
 * go through sendError + ERROR_CODES (A16-style envelope).
 */

const express = require('express')
const multer = require('multer')
const requireAuth = require('../../../middleware/auth')
const originAllowlist = require('../../../middleware/originAllowlist')
const { sendError, ERROR_CODES } = require('../../../middleware/errorEnvelope')
const log = require('../../../lib/logger')
const { captureError } = require('../../../monitoring/sentry')
const {
  aiAttachmentUploadLimiter,
  aiAttachmentDeleteLimiter,
  aiAttachmentPinLimiter,
  aiAttachmentReadLimiter,
} = require('../../../lib/rateLimiters')
const attachmentsService = require('./attachments.service')
const { ALLOWED_MIME_SET, ALLOWED_EXT_SET, REJECTED_MIME_SET } = require('./attachments.constants')

const { requireFeatureFlag } = require('../../../middleware/featureFlagGate')

const requireTrustedOrigin = originAllowlist()
const router = express.Router()

// L20-CRIT-1: feature flag gate for Hub AI v2 attachments. Fail-closed
// per CLAUDE.md §12 — missing row OR enabled:false returns 503. Operator
// kill switch without redeploy.
router.use(requireFeatureFlag('flag_hub_ai_attachments'))

// Multer is configured with the LARGEST per-plan byte cap (Pro = 30 MB).
// The service layer re-checks the per-user effective cap after the buffer
// arrives so a free-tier user uploading 25 MB gets a 413 before R2 is
// touched. multer.memoryStorage() is intentional — we need the bytes in
// memory for stage-1 magic detection + stage-2 structural validation
// before the R2 write.
const MULTER_MAX_BYTES = 32 * 1024 * 1024 // 32 MB hard ceiling

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (REJECTED_MIME_SET.has(file.mimetype)) {
      return cb(new Error('Bare zip uploads are not accepted.'))
    }
    if (!ALLOWED_MIME_SET.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
    // Extension allowlist — stops `evil.exe` from being smuggled with
    // `mimetype: 'text/plain'`.
    const ext = (file.originalname.match(/\.[^.]+$/) || [''])[0].toLowerCase()
    if (ext && !ALLOWED_EXT_SET.has(ext)) {
      return cb(new Error(`Unsupported file extension: ${ext}`))
    }
    cb(null, true)
  },
})

// ── POST /api/ai/attachments ───────────────────────────────────────

router.post('/', requireAuth, requireTrustedOrigin, aiAttachmentUploadLimiter, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(
        res,
        413,
        `File exceeds ${MULTER_MAX_BYTES} byte ceiling.`,
        ERROR_CODES.UPLOAD_INVALID,
      )
    }
    if (err) {
      return sendError(res, 400, err.message, ERROR_CODES.UPLOAD_INVALID)
    }
    if (!req.file) {
      return sendError(res, 400, 'No file uploaded.', ERROR_CODES.UPLOAD_MISSING_FILE)
    }
    try {
      const idempotencyKey = String(req.headers['idempotency-key'] || '').trim() || null
      if (idempotencyKey && !/^[A-Za-z0-9_.\-:]{1,128}$/.test(idempotencyKey)) {
        return sendError(
          res,
          400,
          'Idempotency-Key must be alphanumeric (1-128 chars).',
          ERROR_CODES.BAD_REQUEST,
        )
      }
      let conversationId = null
      if (req.body.conversationId !== undefined) {
        const cid = Number.parseInt(req.body.conversationId, 10)
        if (!Number.isInteger(cid) || cid < 1) {
          return sendError(res, 400, 'Invalid conversationId.', ERROR_CODES.BAD_REQUEST)
        }
        conversationId = cid
      }
      // Resolve full user record for caps logic (role + verification).
      const prisma = require('../../../lib/prisma')
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          id: true,
          role: true,
          emailVerified: true,
          isStaffVerified: true,
        },
      })
      if (!user) {
        return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
      }

      const attachment = await attachmentsService.uploadAttachment({
        user,
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        declaredMime: req.file.mimetype,
        conversationId,
        idempotencyKey,
      })
      return res.status(201).json({
        id: attachment.id,
        conversationId: attachment.conversationId,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        bytes: attachment.bytes,
        pageCount: attachment.pageCount,
        expiresAt: attachment.expiresAt,
        pinnedUntil: attachment.pinnedUntil,
        createdAt: attachment.createdAt,
      })
    } catch (svcErr) {
      if (svcErr.statusCode) {
        return sendError(
          res,
          svcErr.statusCode,
          svcErr.message,
          svcErr.code || ERROR_CODES.BAD_REQUEST,
        )
      }
      captureError(svcErr, { tags: { module: 'ai.attachments', action: 'upload' } })
      log.error(
        {
          event: 'ai.upload.error',
          userId: req.user?.userId,
          err: svcErr.message,
        },
        'AI attachment upload failed',
      )
      return sendError(res, 500, 'Failed to save attachment.', ERROR_CODES.INTERNAL)
    }
  })
})

// ── GET /api/ai/attachments ───────────────────────────────────────

router.get('/', requireAuth, aiAttachmentReadLimiter, async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10)
    const offsetRaw = Number.parseInt(req.query.offset, 10)
    const limit = Number.isInteger(limitRaw) ? limitRaw : 30
    const offset = Number.isInteger(offsetRaw) ? offsetRaw : 0
    const result = await attachmentsService.listAttachments({
      userId: req.user.userId,
      limit,
      offset,
    })
    return res.json(result)
  } catch (err) {
    captureError(err, { tags: { module: 'ai.attachments', action: 'list' } })
    return sendError(res, 500, 'Failed to list attachments.', ERROR_CODES.INTERNAL)
  }
})

// ── DELETE /api/ai/attachments/:id ────────────────────────────────

router.delete(
  '/:id',
  requireAuth,
  requireTrustedOrigin,
  aiAttachmentDeleteLimiter,
  async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10)
      if (!Number.isInteger(id) || id < 1) {
        return sendError(res, 400, 'Invalid attachment id.', ERROR_CODES.BAD_REQUEST)
      }
      const result = await attachmentsService.softDeleteAttachment({
        attachmentId: id,
        userId: req.user.userId,
      })
      if (!result) {
        return sendError(res, 404, 'Attachment not found.', ERROR_CODES.NOT_FOUND)
      }
      return res.json({ ok: true })
    } catch (err) {
      captureError(err, { tags: { module: 'ai.attachments', action: 'delete' } })
      return sendError(res, 500, 'Failed to delete attachment.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── POST /api/ai/attachments/:id/pin ──────────────────────────────

router.post(
  '/:id/pin',
  requireAuth,
  requireTrustedOrigin,
  aiAttachmentPinLimiter,
  async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10)
      if (!Number.isInteger(id) || id < 1) {
        return sendError(res, 400, 'Invalid attachment id.', ERROR_CODES.BAD_REQUEST)
      }
      const prisma = require('../../../lib/prisma')
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true, emailVerified: true, isStaffVerified: true },
      })
      if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
      const result = await attachmentsService.pinAttachment({
        attachmentId: id,
        user,
      })
      if (!result) {
        return sendError(res, 404, 'Attachment not found.', ERROR_CODES.NOT_FOUND)
      }
      return res.json({
        id: result.id,
        pinnedUntil: result.pinnedUntil,
        expiresAt: result.expiresAt,
      })
    } catch (err) {
      if (err.statusCode) {
        return sendError(res, err.statusCode, err.message, err.code || ERROR_CODES.BAD_REQUEST)
      }
      captureError(err, { tags: { module: 'ai.attachments', action: 'pin' } })
      return sendError(res, 500, 'Failed to pin attachment.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
