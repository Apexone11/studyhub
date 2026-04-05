const express = require('express')
const multer = require('multer')
const path = require('path')
const { NOTE_IMAGES_DIR } = require('../../lib/storage')
const requireAuth = require('../../middleware/auth')
const requireVerifiedEmail = require('../../middleware/requireVerifiedEmail')
const optionalAuth = require('../../core/auth/optionalAuth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { notesMutateLimiter, notesReadLimiter, notesCommentLimiter, commentReactLimiter } = require('../../lib/rateLimiters')
const notesController = require('./notes.controller')

const router = express.Router()

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

// ── PATCH /api/notes/:id ────────────────────────────────────────────��──────────────────────────────��
router.patch('/:id', requireAuth, mutateLimiter, requireVerifiedEmail, notesController.updateNote)

// ── DELETE /api/notes/:id ───────────────────────────────────────
router.delete('/:id', requireAuth, mutateLimiter, notesController.deleteNote)

// ═══════════════════════════════════════════════════════════════════════════
// Note Comments
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/notes/:id/comments ─────────────────────────────────
router.get('/:id/comments', optionalAuth, readLimiter, notesController.listNoteComments)

// ── POST /api/notes/:id/comments ────────────────────────────────
router.post('/:id/comments', requireAuth, requireVerifiedEmail, commentLimiter, notesController.createNoteComment)

// ── PATCH /api/notes/:id/comments/:commentId ── resolve/unresolve
router.patch('/:id/comments/:commentId', requireAuth, commentLimiter, notesController.updateNoteComment)

// ── POST /api/notes/:id/comments/:commentId/react ────────────────
router.post('/:id/comments/:commentId/react', requireAuth, commentReactLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id, 10)
  const commentId = parseInt(req.params.commentId, 10)
  const userId = req.user.userId
  const { type } = req.body || {}

  if (!Number.isInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Invalid note id.' })
  if (!Number.isInteger(commentId) || commentId < 1) return res.status(400).json({ error: 'Invalid comment id.' })
  if (!type || (type !== 'like' && type !== 'dislike')) {
    return res.status(400).json({ error: 'Reaction type must be "like" or "dislike".' })
  }

  try {
    const comment = await prisma.noteComment.findUnique({
      where: { id: commentId },
      select: { id: true, noteId: true },
    })
    if (!comment || comment.noteId !== noteId) return res.status(404).json({ error: 'Comment not found.' })

    // Verify note is readable
    const note = await prisma.note.findUnique({
      where: { id: comment.noteId },
      select: { id: true, private: true, userId: true },
    })
    if (!note || !canReadNote(note, req.user)) {
      return res.status(404).json({ error: 'Comment not found.' })
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
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/notes/:id/comments/:commentId ───────────────────
router.delete('/:id/comments/:commentId', requireAuth, commentLimiter, notesController.deleteNoteComment)

// ═══════════════════════════════════════════════════════════════════════════
// Note Version History
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/notes/:id/versions — Save a named version snapshot ───
router.post('/:id/versions', requireAuth, mutateLimiter, requireVerifiedEmail, notesController.createNoteVersion)

// ── GET /api/notes/:id/versions — List version history ─────────────
router.get('/:id/versions', requireAuth, readLimiter, notesController.listNoteVersions)

// ── GET /api/notes/:id/versions/:versionId — Get a specific version ─
router.get('/:id/versions/:versionId', requireAuth, readLimiter, notesController.getNoteVersion)

// ── POST /api/notes/:id/versions/:versionId/restore — Restore version
router.post('/:id/versions/:versionId/restore', requireAuth, mutateLimiter, requireVerifiedEmail, notesController.restoreNoteVersion)

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
      return res.status(400).json({ error: 'Image must be 5 MB or smaller.' })
    }
    if (err) return res.status(400).json({ error: err.message })
    notesController.uploadNoteImage(req, res)
  })
})

// ── POST /api/notes/:id/react — Like or dislike a note ──────────────────
router.post('/:id/react', requireAuth, commentReactLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id, 10)
  const userId = req.user.userId
  const { type } = req.body || {}

  if (!['like', 'dislike'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "like" or "dislike".' })
  }

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId }, select: { id: true, private: true } })
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (note.private) return res.status(403).json({ error: 'Cannot react to private notes.' })

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
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/notes/:id/download — Track a note download ────────────────
router.post('/:id/download', optionalAuth, readLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id, 10)
  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, private: true, allowDownloads: true },
    })
    if (!note || note.private || !note.allowDownloads) {
      return res.status(404).json({ error: 'Note not found or downloads not allowed.' })
    }

    await prisma.note.update({
      where: { id: noteId },
      data: { downloads: { increment: 1 } },
    })

    res.json({ message: 'Download tracked.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
