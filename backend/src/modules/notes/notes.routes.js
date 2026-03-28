const express = require('express')
const rateLimit = require('express-rate-limit')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { createNotification } = require('../../lib/notify')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { trackActivity } = require('../../lib/activityTracker')
const { buildAnchorContext, validateAnchorInput } = require('../../lib/noteAnchor')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { updateFingerprint } = require('../../lib/plagiarismService')
const { getInitialModerationStatus } = require('../../lib/trustGate')
const requireAuth = require('../../middleware/auth')
const requireVerifiedEmail = require('../../middleware/requireVerifiedEmail')
const optionalAuth = require('../../core/auth/optionalAuth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { timedSection, logTiming } = require('../../lib/requestTiming')

const router = express.Router()

const mutateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many comments. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const COMMENT_INCLUDE = {
  author: { select: { id: true, username: true } },
}

// Fields to expose to the client — anchorContext is always returned so the frontend
// can perform orphan detection without a second roundtrip.

/** Returns true if the given user can read the note (shared or owner/admin). */
function canReadNote(note, user) {
  if (!note.private) return true
  return user && (user.userId === note.userId || user.role === 'admin')
}

const NOTE_INCLUDE = {
  course: { select: { id: true, code: true } },
  author: { select: { id: true, username: true } },
}

// ── GET /api/notes/:id ── Single note (shared or owner) ─────────
router.get('/:id', optionalAuth, readLimiter, async (req, res) => {
  req._timingStart = Date.now()
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Invalid note id.' })

  try {
    const mainSection = await timedSection('note-main', () =>
      prisma.note.findUnique({ where: { id: noteId }, include: NOTE_INCLUDE })
    )
    const note = mainSection.data

    if (!note) return res.status(404).json({ error: 'Note not found.' })

    const isOwner = req.user && (req.user.userId === note.userId || req.user.role === 'admin')

    // Private notes: only owner/admin can see
    if (note.private && !isOwner) {
      return res.status(404).json({ error: 'Note not found.' })
    }

    logTiming(req, { sections: [mainSection], extra: { noteId, isOwner: Boolean(isOwner) } })

    res.json({ ...note, isOwner: Boolean(isOwner) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/notes ── List notes (own or shared) ────────────────
router.get('/', requireAuth, readLimiter, async (req, res) => {
  const { q, courseId, private: priv, shared } = req.query
  try {
    const where = {}

    if (shared === 'true') {
      // Shared notes from all users
      where.private = false
    } else {
      // Own notes only
      where.userId = req.user.userId
      if (priv !== undefined) where.private = priv === 'true'
    }

    if (q) where.title = { contains: q, mode: 'insensitive' }
    if (courseId) {
      const parsed = parseInt(courseId, 10)
      if (!Number.isNaN(parsed)) where.courseId = parsed
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const skip = (page - 1) * limit

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        include: NOTE_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.note.count({ where }),
    ])
    res.json({ notes, total, page, limit })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/notes ─────────────────────────────────────────────
router.post('/', requireAuth, mutateLimiter, requireVerifiedEmail, async (req, res) => {
  const { title, content, courseId, private: priv } = req.body || {}
  const trimmedTitle = typeof title === 'string' ? title.trim() : ''

  if (!trimmedTitle) return res.status(400).json({ error: 'Title is required.' })
  if (trimmedTitle.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' })

  const contentStr = typeof content === 'string' ? content : ''
  if (contentStr.length > 50000) return res.status(400).json({ error: 'Content must be 50000 characters or fewer.' })

  try {
    const moderationStatus = priv === false
      ? getInitialModerationStatus(req.user)
      : 'clean'  // Private notes don't need moderation hold
    const note = await prisma.note.create({
      data: {
        title: trimmedTitle,
        content: contentStr,
        userId: req.user.userId,
        courseId: courseId ? parseInt(courseId, 10) || null : null,
        private: priv !== false,
        moderationStatus,
      },
      include: NOTE_INCLUDE,
    })

    // Async content moderation — fire-and-forget after response is sent
    if (isModerationEnabled()) {
      const textToScan = `${trimmedTitle} ${contentStr}`.trim()
      void scanContent({ contentType: 'note', contentId: note.id, text: textToScan, userId: req.user.userId })
    }

    /* Content fingerprinting for plagiarism detection (fire-and-forget) */
    void updateFingerprint('note', note.id, contentStr)

    res.status(201).json(note)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/notes/:id ────────────────────────────────────────────��──────────────────────────────��
router.patch('/:id', requireAuth, mutateLimiter, requireVerifiedEmail, async (req, res) => {
  const noteId = parseInt(req.params.id)
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: note.userId,
      message: 'Not your note.',
      targetType: 'note',
      targetId: noteId,
    })) return

    const { title, content, courseId, private: priv, allowDownloads } = req.body || {}
    const data = {}
    if (title !== undefined) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : ''
      if (!trimmedTitle) return res.status(400).json({ error: 'Title cannot be empty.' })
      if (trimmedTitle.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' })
      data.title = trimmedTitle
    }
    if (content !== undefined) {
      const contentStr = typeof content === 'string' ? content : ''
      if (contentStr.length > 50000) return res.status(400).json({ error: 'Content must be 50000 characters or fewer.' })
      data.content = contentStr
    }
    if (courseId !== undefined) data.courseId = courseId ? parseInt(courseId, 10) || null : null
    if (priv !== undefined) data.private = Boolean(priv)
    if (allowDownloads !== undefined) data.allowDownloads = Boolean(allowDownloads)

    // If making note private, reset allowDownloads
    if (data.private === true) data.allowDownloads = false

    // If toggling from private to public, apply trust-gated moderation status
    if (req.body.private === false && note.private === true) {
      data.moderationStatus = getInitialModerationStatus(req.user)
    }

    const updated = await prisma.note.update({
      where: { id: noteId },
      data,
      include: NOTE_INCLUDE,
    })

    // Async content moderation on title/content changes — fire-and-forget
    if (isModerationEnabled() && (data.title || data.content !== undefined)) {
      const textToScan = `${updated.title} ${updated.content || ''}`.trim()
      if (textToScan) {
        void scanContent({ contentType: 'note', contentId: noteId, text: textToScan, userId: req.user.userId })
      }
    }

    /* Content fingerprinting on content changes (fire-and-forget) */
    if (data.content !== undefined) void updateFingerprint('note', noteId, updated.content)

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/notes/:id ───────────────────────────────────────
router.delete('/:id', requireAuth, mutateLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id)
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: note.userId,
      message: 'Not your note.',
      targetType: 'note',
      targetId: noteId,
    })) return
    await prisma.note.delete({ where: { id: noteId } })
    res.json({ message: 'Note deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Note Comments
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/notes/:id/comments ─────────────────────────────────
router.get('/:id/comments', optionalAuth, async (req, res) => {
  req._timingStart = Date.now()
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Invalid note id.' })

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0)

  try {
    const noteSection = await timedSection('note-lookup', () =>
      prisma.note.findUnique({ where: { id: noteId }, select: { id: true, private: true, userId: true } })
    )
    const note = noteSection.data
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (!canReadNote(note, req.user || null)) return res.status(404).json({ error: 'Note not found.' })

    const commentWhere = { noteId }

    const [commentsSection, countSection] = await Promise.all([
      timedSection('comments', () =>
        prisma.noteComment.findMany({
          where: commentWhere,
          include: COMMENT_INCLUDE,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        })
      ),
      timedSection('count', () => prisma.noteComment.count({ where: commentWhere })),
    ])

    logTiming(req, {
      sections: [noteSection, commentsSection, countSection],
      extra: { noteId, commentCount: countSection.data },
    })

    res.json({ comments: commentsSection.data, total: countSection.data, limit, offset })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/notes/:id/comments ────────────────────────────────
router.post('/:id/comments', requireAuth, requireVerifiedEmail, commentLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Invalid note id.' })

  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })

  // Optional inline anchor fields — validated and context-enriched
  const anchor = validateAnchorInput(req.body)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, private: true, userId: true, title: true, content: true },
    })
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (!canReadNote(note, req.user)) return res.status(404).json({ error: 'Note not found.' })

    // Build surrounding context for anchor re-matching after edits
    const anchorContext = anchor
      ? buildAnchorContext(note.content, anchor.anchorText, anchor.anchorOffset)
      : null

    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.noteComment.create({
      data: {
        content,
        noteId,
        userId: req.user.userId,
        anchorText: anchor?.anchorText || null,
        anchorOffset: anchor ? anchor.anchorOffset : null,
        anchorContext,
        moderationStatus,
      },
      include: COMMENT_INCLUDE,
    })

    // Async content moderation on comment — fire-and-forget
    if (isModerationEnabled()) {
      void scanContent({ contentType: 'note_comment', contentId: comment.id, text: content, userId: req.user.userId })
    }

    trackActivity(prisma, req.user.userId, 'comments')

    // Notify note owner (skip if commenter is the owner)
    if (note.userId !== req.user.userId) {
      await createNotification(prisma, {
        userId: note.userId,
        type: 'comment',
        message: `${req.user.username} commented on your note "${note.title}".`,
        actorId: req.user.userId,
        linkPath: `/notes/${noteId}`,
      })
    }

    await notifyMentionedUsers(prisma, {
      text: content,
      actorId: req.user.userId,
      actorUsername: req.user.username,
      excludeUserIds: [note.userId],
      message: `${req.user.username} mentioned you in a comment on "${note.title}".`,
      linkPath: `/notes/${noteId}`,
    })

    res.status(201).json(comment)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/notes/:id/comments/:commentId ── resolve/unresolve
router.patch('/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id, 10)
  const commentId = parseInt(req.params.commentId, 10)
  if (!Number.isInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Invalid note id.' })
  if (!Number.isInteger(commentId) || commentId < 1) return res.status(400).json({ error: 'Invalid comment id.' })

  const { resolved } = req.body || {}
  if (typeof resolved !== 'boolean') return res.status(400).json({ error: 'resolved must be a boolean.' })

  try {
    const comment = await prisma.noteComment.findUnique({
      where: { id: commentId },
      include: { note: { select: { id: true, userId: true } } },
    })
    if (!comment || comment.noteId !== noteId) return res.status(404).json({ error: 'Comment not found.' })

    // Only note owner or admin can resolve/unresolve
    const isNoteOwner = req.user.userId === comment.note.userId || req.user.role === 'admin'
    if (!isNoteOwner) return res.status(403).json({ error: 'Only the note owner can resolve comments.' })

    const updated = await prisma.noteComment.update({
      where: { id: commentId },
      data: { resolved },
      include: COMMENT_INCLUDE,
    })

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/notes/:id/comments/:commentId ───────────────────
router.delete('/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  const noteId = parseInt(req.params.id, 10)
  const commentId = parseInt(req.params.commentId, 10)
  if (!Number.isInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Invalid note id.' })
  if (!Number.isInteger(commentId) || commentId < 1) return res.status(400).json({ error: 'Invalid comment id.' })

  try {
    const comment = await prisma.noteComment.findUnique({
      where: { id: commentId },
      include: { note: { select: { id: true, userId: true } } },
    })
    if (!comment || comment.noteId !== noteId) return res.status(404).json({ error: 'Comment not found.' })

    // Comment author, note owner, or admin can delete
    const canDelete = req.user.userId === comment.userId
      || req.user.userId === comment.note.userId
      || req.user.role === 'admin'
    if (!canDelete) return res.status(403).json({ error: 'Not authorized to delete this comment.' })

    await prisma.noteComment.delete({ where: { id: commentId } })
    res.json({ message: 'Comment deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
