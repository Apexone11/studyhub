const express = require('express')
const multer = require('multer')
const path = require('path')
const { NOTE_IMAGES_DIR, safeUnlinkFile } = require('../../lib/storage')
const { signatureMatchesExpected, validateMagicBytes } = require('../../lib/fileSignatures')
const requireAuth = require('../../middleware/auth')
const requireVerifiedEmail = require('../../middleware/requireVerifiedEmail')
const optionalAuth = require('../../core/auth/optionalAuth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const {
  notesMutateLimiter,
  notesReadLimiter,
  notesCommentLimiter,
  commentReactLimiter,
  notesPatchLimiter,
  notesChunkLimiter,
  notesRestoreLimiter,
  notesDiffLimiter,
  noteHighlightWriteLimiter,
  noteHighlightLimiter,
} = require('../../lib/rateLimiters')
const notesController = require('./notes.controller')
const noteHighlightsController = require('./note.highlights.controller')
const { importNoteHandler, importUploadMiddleware } = require('./notes.import.controller')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()
const requireTrustedOrigin = originAllowlist()

// Defense-in-depth origin check on every write under /api/notes. Safe
// methods (GET/HEAD/OPTIONS) short-circuit in originAllowlist so this
// is safe at the router.use level. CLAUDE.md A11. The per-route
// `requireTrustedOrigin` references below are now redundant but kept
// for grep visibility — removing them would make a future code-mover
// think the route had no origin check.
router.use(requireTrustedOrigin)

const mutateLimiter = notesMutateLimiter
const readLimiter = notesReadLimiter
const commentLimiter = notesCommentLimiter

/** Returns true if the given user can read the note (shared or owner/admin). */
function canReadNote(note, user) {
  if (!note.private) return true
  return user && (user.userId === note.userId || user.role === 'admin')
}

// ── GET /api/notes/:id ── Single note (shared or owner) ─────────
router.get('/:id', optionalAuth, readLimiter, notesController.getNoteById)

// ── GET /api/notes ── List notes (own or shared) ────────────────
router.get('/', requireAuth, readLimiter, notesController.listNotes)

// ── POST /api/notes ─────────────────────────────────────────────
router.post('/', requireAuth, mutateLimiter, requireVerifiedEmail, notesController.createNote)

// ── POST /api/notes/import ─ Drag-and-drop file → AI-titled Note ─
// 2026-05-14 — v1 supports plain-text + markdown. PDF/DOCX gated on
// the AI attachments parser stack (planned follow-up).
router.post(
  '/import',
  requireAuth,
  requireVerifiedEmail,
  requireTrustedOrigin,
  mutateLimiter,
  importUploadMiddleware,
  importNoteHandler,
)

// ── PATCH /api/notes/:id ────────────────────────────────────────────��──────────────────────────────��
router.patch(
  '/:id',
  requireAuth,
  notesPatchLimiter,
  requireVerifiedEmail,
  notesController.updateNote,
)

// ── POST /api/notes/:id ── beacon-only alias for the PATCH update ─────────
// navigator.sendBeacon (the tab-close autosave in useNotePersistence.js) can
// only issue POST, so the final unsaved edits 404'd against the PATCH-only
// route and were lost. This alias reaches the identical updateNote handler
// with the same middleware chain (auth + per-user patch limiter +
// verified-email gate + originAllowlist from router.use above) so the
// concurrency/revision logic PATCH relies on is preserved. Auth is NOT
// weakened — every guard on the PATCH route is mirrored here.
router.post(
  '/:id',
  requireAuth,
  notesPatchLimiter,
  requireVerifiedEmail,
  notesController.updateNote,
)

// ── POST /api/notes/:id/chunks ── Chunked autosave append ──────
router.post(
  '/:id/chunks',
  requireAuth,
  requireVerifiedEmail,
  notesChunkLimiter,
  notesController.appendChunk,
)

// ── DELETE /api/notes/:id ───────────────────────────────────────
router.delete('/:id', requireAuth, mutateLimiter, notesController.deleteNote)

// ═══════════════════════════════════════════════════════════════════════════
// Note Comments
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/notes/:id/comments ─────────────────────────────────
router.get('/:id/comments', optionalAuth, readLimiter, notesController.listNoteComments)

// ── POST /api/notes/:id/comments ────────────────────────────────
router.post(
  '/:id/comments',
  requireAuth,
  requireVerifiedEmail,
  commentLimiter,
  notesController.createNoteComment,
)

// ── PATCH /api/notes/:id/comments/:commentId ── resolve/unresolve
router.patch(
  '/:id/comments/:commentId',
  requireAuth,
  commentLimiter,
  notesController.updateNoteComment,
)

// ── POST /api/notes/:id/comments/:commentId/react ────────────────
router.post(
  '/:id/comments/:commentId/react',
  requireAuth,
  commentReactLimiter,
  async (req, res) => {
    const noteId = Number.parseInt(req.params.id, 10)
    const commentId = Number.parseInt(req.params.commentId, 10)
    const { userId } = req.user
    const { type } = req.body || {}

    if (!Number.isInteger(noteId) || noteId < 1)
      return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
    if (!Number.isInteger(commentId) || commentId < 1)
      return sendError(res, 400, 'Invalid comment id.', ERROR_CODES.BAD_REQUEST)
    if (!type || (type !== 'like' && type !== 'dislike')) {
      return sendError(
        res,
        400,
        'Reaction type must be "like" or "dislike".',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    try {
      const comment = await prisma.noteComment.findUnique({
        where: { id: commentId },
        select: { id: true, noteId: true },
      })
      if (!comment || comment.noteId !== noteId)
        return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)

      // Verify note is readable
      const note = await prisma.note.findUnique({
        where: { id: comment.noteId },
        select: { id: true, private: true, userId: true },
      })
      if (!note || !canReadNote(note, req.user)) {
        return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
      }

      const existing = await prisma.noteCommentReaction.findUnique({
        where: { userId_commentId: { userId, commentId } },
      })

      // Toggle logic: if same type, remove; if different, update; if none, create
      if (existing && existing.type === type) {
        await prisma.noteCommentReaction.delete({
          where: { userId_commentId: { userId, commentId } },
        })
      } else if (existing) {
        await prisma.noteCommentReaction.update({
          where: { userId_commentId: { userId, commentId } },
          data: { type },
        })
      } else {
        await prisma.noteCommentReaction.create({
          data: { userId, commentId, type },
        })
      }

      // Get updated counts
      const [likes, dislikes, userReaction] = await Promise.all([
        prisma.noteCommentReaction.count({ where: { commentId, type: 'like' } }),
        prisma.noteCommentReaction.count({ where: { commentId, type: 'dislike' } }),
        prisma.noteCommentReaction.findUnique({
          where: { userId_commentId: { userId, commentId } },
        }),
      ])

      res.json({
        reactionCounts: { like: likes, dislike: dislikes },
        userReaction: userReaction ? userReaction.type : null,
      })
    } catch (err) {
      captureError(err, { route: req.originalUrl, method: req.method })
      sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── DELETE /api/notes/:id/comments/:commentId ───────────────────
router.delete(
  '/:id/comments/:commentId',
  requireAuth,
  commentLimiter,
  notesController.deleteNoteComment,
)

// ═══════════════════════════════════════════════════════════════════════════
// Note Highlights (Note Review v1 — Phase 9, 2026-05-12)
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/notes/:noteId/highlights ────────────────────────────────────
router.get(
  '/:noteId/highlights',
  requireAuth,
  notesReadLimiter,
  noteHighlightsController.listHighlights,
)

// ── POST /api/notes/:noteId/highlights ───────────────────────────────────
// Per-pair daily cap (G1-3) stacked on top of the per-user write limiter.
// noteHighlightLimiter is keyed on the (reviewerId, noteId) pair so a
// single reviewer can't drown a single note in 20+ highlights/day, but
// they can still review across multiple notes at a healthy cadence.
router.post(
  '/:noteId/highlights',
  requireAuth,
  requireTrustedOrigin,
  noteHighlightWriteLimiter,
  noteHighlightLimiter,
  noteHighlightsController.createHighlight,
)

// ── DELETE /api/notes/:noteId/highlights/:id ─────────────────────────────
router.delete(
  '/:noteId/highlights/:id',
  requireAuth,
  requireTrustedOrigin,
  noteHighlightWriteLimiter,
  noteHighlightsController.deleteHighlight,
)

// ═══════════════════════════════════════════════════════════════════════════
// Note Version History
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/notes/:id/versions — Save a named version snapshot ───
router.post(
  '/:id/versions',
  requireAuth,
  mutateLimiter,
  requireVerifiedEmail,
  notesController.createNoteVersion,
)

// ── GET /api/notes/:id/versions — List version history ─────────────
router.get('/:id/versions', requireAuth, readLimiter, notesController.listNoteVersions)

// ── GET /api/notes/:id/versions/:versionId — Get a specific version ─
router.get('/:id/versions/:versionId', requireAuth, readLimiter, notesController.getNoteVersion)

// ── GET /api/notes/:id/versions/:versionId/diff — Word diff vs current or another version
router.get(
  '/:id/versions/:versionId/diff',
  requireAuth,
  notesDiffLimiter,
  notesController.getVersionDiff,
)

// ── POST /api/notes/:id/versions/:versionId/restore — Restore version
router.post(
  '/:id/versions/:versionId/restore',
  requireAuth,
  notesRestoreLimiter,
  requireVerifiedEmail,
  notesController.restoreNoteVersion,
)

// ═══════════════════════════════════════════════════════════════════════════
// Note Stars
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/notes/:id/star ─────────────────────────────────────
router.post('/:id/star', requireAuth, mutateLimiter, notesController.starNote)

// ── DELETE /api/notes/:id/star ───────────────────────────────────
router.delete('/:id/star', requireAuth, mutateLimiter, notesController.unstarNote)

// ═══════════════════════════════════════════════════════════════════════════
// Note Pin / Tags
// ═══════════════════════════════════════════════════════════════════════════

// ── PATCH /api/notes/:id/pin — Toggle pinned status ──────────────
router.patch('/:id/pin', requireAuth, mutateLimiter, notesController.toggleNotePin)

// ── PATCH /api/notes/:id/tags — Update tags ──────────────────────
router.patch('/:id/tags', requireAuth, mutateLimiter, notesController.updateNoteTags)

// ── PATCH /api/notes/:id/metadata — Privacy / course / downloads ─
// Owner-only (assertOwnerOrAdmin runs in the controller). Lives outside
// the hardened content-save path so toggling Private doesn't trigger a
// version snapshot or get suppressed by content-hash no-op detection.
router.patch('/:id/metadata', requireAuth, mutateLimiter, notesController.updateNoteMetadata)

// ═══════════════════════════════════════════════════════════════════════════
// Note Image Upload
// ═══════════════════════════════════════════════════════════════════════════

const NOTE_IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const NOTE_IMAGE_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

function safeName(original) {
  return `${Date.now()}-${original.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)}`
}

const noteImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, NOTE_IMAGES_DIR),
  filename: (req, file, cb) => cb(null, `note-${req.user.userId}-${safeName(file.originalname)}`),
})

const noteImageUpload = multer({
  storage: noteImageStorage,
  limits: { fileSize: NOTE_IMAGE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!NOTE_IMAGE_ALLOWED_MIME.has(file.mimetype) || !NOTE_IMAGE_ALLOWED_EXT.has(ext)) {
      return cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed.'))
    }
    cb(null, true)
  },
})

// ── POST /api/notes/:id/images — Upload an image for embedding ───
router.post('/:id/images', requireAuth, mutateLimiter, requireVerifiedEmail, (req, res) => {
  noteImageUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 400, 'Image must be 5 MB or smaller.', ERROR_CODES.BAD_REQUEST)
    }
    if (err) return sendError(res, 400, err.message, ERROR_CODES.BAD_REQUEST)
    if (req.file) {
      if (!signatureMatchesExpected(req.file.path, Array.from(NOTE_IMAGE_ALLOWED_MIME)).ok) {
        safeUnlinkFile(req.file.path)
        return sendError(
          res,
          400,
          'Image contents do not match a supported image format.',
          ERROR_CODES.BAD_REQUEST,
        )
      }
      const magic = validateMagicBytes(req.file.path, req.file.mimetype)
      if (!magic.valid) {
        safeUnlinkFile(req.file.path)
        return sendError(
          res,
          400,
          'Image file signature does not match its declared type.',
          ERROR_CODES.BAD_REQUEST,
        )
      }
    }
    notesController.uploadNoteImage(req, res)
  })
})

// ── POST /api/notes/:id/react — Like or dislike a note ──────────────────
router.post('/:id/react', requireAuth, commentReactLimiter, async (req, res) => {
  const noteId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1) {
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  }
  const { userId } = req.user
  const { type } = req.body || {}

  if (!['like', 'dislike'].includes(type)) {
    return sendError(res, 400, 'Type must be "like" or "dislike".', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, private: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (note.private)
      return sendError(res, 403, 'Cannot react to private notes.', ERROR_CODES.FORBIDDEN)

    const existing = await prisma.noteReaction.findUnique({
      where: { userId_noteId: { userId, noteId } },
    })

    if (existing) {
      if (existing.type === type) {
        // Same type -> remove
        await prisma.noteReaction.delete({ where: { userId_noteId: { userId, noteId } } })
      } else {
        // Different type -> update
        await prisma.noteReaction.update({
          where: { userId_noteId: { userId, noteId } },
          data: { type },
        })
      }
    } else {
      // Create new
      await prisma.noteReaction.create({ data: { userId, noteId, type } })
    }

    // Get updated counts
    const [likes, dislikes] = await Promise.all([
      prisma.noteReaction.count({ where: { noteId, type: 'like' } }),
      prisma.noteReaction.count({ where: { noteId, type: 'dislike' } }),
    ])

    const currentReaction = await prisma.noteReaction.findUnique({
      where: { userId_noteId: { userId, noteId } },
      select: { type: true },
    })

    res.json({
      reactionCounts: { like: likes, dislike: dislikes },
      userReaction: currentReaction?.type || null,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /api/notes/:id/download — Track a note download ────────────────
router.post('/:id/download', optionalAuth, readLimiter, async (req, res) => {
  const noteId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1) {
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  }
  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, private: true, allowDownloads: true },
    })
    if (!note || note.private || !note.allowDownloads) {
      return sendError(res, 404, 'Note not found or downloads not allowed.', ERROR_CODES.NOT_FOUND)
    }

    await prisma.note.update({
      where: { id: noteId },
      data: { downloads: { increment: 1 } },
    })

    res.json({ message: 'Download tracked.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
