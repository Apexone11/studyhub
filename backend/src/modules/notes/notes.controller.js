const crypto = require('crypto')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { createNotification } = require('../../lib/notify')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { trackActivity } = require('../../lib/activityTracker')
const { buildAnchorContext, validateAnchorInput } = require('../../lib/noteAnchor')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { updateFingerprint } = require('../../lib/plagiarismService')
const { getInitialModerationStatus } = require('../../lib/trustGate')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { normalizeCommentGifAttachments } = require('../../lib/commentGifAttachments')
const { cleanupNoteImageIfUnused, extractNoteImageUrlsFromTexts } = require('../../lib/storage')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { defaultChunkBuffer } = require('./notes.chunks.js')
const { buildWordDiff } = require('./notes.diff.js')
const { timedSection, logTiming } = require('../../lib/requestTiming')
const {
  computeContentHash,
  isRevisionConflict,
  shouldCreateAutoVersion,
} = require('./notes.concurrency.js')

const MAX_NOTE_CONTENT_HARDENED = 200000
const AUTO_VERSION_RETENTION = 50

const COMMENT_INCLUDE = {
  author: { select: { id: true, username: true, avatarUrl: true } },
}

const NOTE_INCLUDE = {
  course: { select: { id: true, code: true } },
  author: { select: { id: true, username: true, avatarUrl: true } },
}

function parseNoteTags(tagsValue) {
  if (Array.isArray(tagsValue)) {
    return tagsValue.filter((tag) => typeof tag === 'string' && tag.trim())
  }

  if (typeof tagsValue !== 'string' || !tagsValue.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(tagsValue)
    return Array.isArray(parsed)
      ? parsed.filter((tag) => typeof tag === 'string' && tag.trim())
      : []
  } catch {
    return []
  }
}

function serializeNote(note, extra = {}) {
  if (!note || typeof note !== 'object') {
    return note
  }

  return {
    ...note,
    tags: parseNoteTags(note.tags),
    ...extra,
  }
}

/**
 * Returns true if the given user can read the note (shared or owner/admin).
 */
function canReadNote(note, user) {
  if (!note.private) return true
  return user && (user.userId === note.userId || user.role === 'admin')
}

/**
 * GET /api/notes/:id — Single note (shared or owner)
 */
async function getNoteById(req, res) {
  req._timingStart = Date.now()
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    const mainSection = await timedSection('note-main', () =>
      prisma.note.findUnique({ where: { id: noteId }, include: NOTE_INCLUDE }),
    )
    const note = mainSection.data

    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)

    // Notes require authentication to view
    if (!req.user) {
      return sendError(res, 401, 'Sign in to view notes.', ERROR_CODES.UNAUTHORIZED)
    }

    const isOwner = req.user.userId === note.userId || req.user.role === 'admin'

    // Private notes: only owner/admin can see
    if (note.private && !isOwner) {
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    }

    // Fetch social data in parallel: star status, reaction counts, star count
    const userId = req.user?.userId
    const [starred, starCount, likes, dislikes, userReaction] = await Promise.all([
      userId
        ? prisma.noteStar.findUnique({ where: { userId_noteId: { userId, noteId } } }).then(Boolean)
        : false,
      prisma.noteStar.count({ where: { noteId } }),
      prisma.noteReaction.count({ where: { noteId, type: 'like' } }).catch(() => 0),
      prisma.noteReaction.count({ where: { noteId, type: 'dislike' } }).catch(() => 0),
      userId
        ? prisma.noteReaction
            .findUnique({ where: { userId_noteId: { userId, noteId } }, select: { type: true } })
            .catch(() => null)
        : null,
    ])

    logTiming(req, { sections: [mainSection], extra: { noteId, isOwner: Boolean(isOwner) } })

    res.json(
      serializeNote(note, {
        isOwner: Boolean(isOwner),
        starred,
        starCount,
        downloads: note.downloads || 0,
        reactionCounts: { like: likes, dislike: dislikes },
        userReaction: userReaction?.type || null,
      }),
    )
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * GET /api/notes — List notes (own or shared)
 */
async function listNotes(req, res) {
  const { q, courseId, private: priv, shared, tag } = req.query
  try {
    const where = {}
    const normalizedQuery = typeof q === 'string' ? q.trim() : ''
    const normalizedTag = typeof tag === 'string' ? tag.trim().toLowerCase() : ''

    if (shared === 'true') {
      // Shared notes from all users
      where.private = false
    } else {
      // Own notes only
      where.userId = req.user.userId
      if (priv !== undefined) where.private = priv === 'true'
    }

    if (normalizedQuery) {
      where.OR = [
        { title: { contains: normalizedQuery, mode: 'insensitive' } },
        { content: { contains: normalizedQuery, mode: 'insensitive' } },
        { tags: { contains: normalizedQuery, mode: 'insensitive' } },
      ]
    }

    if (normalizedTag) {
      where.tags = { contains: `"${normalizedTag}"`, mode: 'insensitive' }
    }

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

    const noteIds = notes.map((note) => note.id)
    let starredIdSet = new Set()

    if (req.user?.userId && noteIds.length) {
      const noteStars = await prisma.noteStar.findMany({
        where: {
          userId: req.user.userId,
          noteId: { in: noteIds },
        },
        select: { noteId: true },
      })

      starredIdSet = new Set(noteStars.map((row) => row.noteId))
    }

    res.json({
      notes: notes.map((note) => serializeNote(note, { _starred: starredIdSet.has(note.id) })),
      total,
      page,
      limit,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/notes — Create a new note
 */
async function createNote(req, res) {
  const { title, content, courseId, private: priv } = req.body || {}
  const trimmedTitle = typeof title === 'string' ? title.trim() : ''

  if (!trimmedTitle) return sendError(res, 400, 'Title is required.', ERROR_CODES.BAD_REQUEST)
  if (trimmedTitle.length > 120)
    return sendError(res, 400, 'Title must be 120 characters or fewer.', ERROR_CODES.BAD_REQUEST)

  const contentStr = typeof content === 'string' ? content : ''
  if (contentStr.length > 50000)
    return sendError(
      res,
      400,
      'Content must be 50000 characters or fewer.',
      ERROR_CODES.BAD_REQUEST,
    )

  try {
    const moderationStatus = priv === false ? getInitialModerationStatus(req.user) : 'clean' // Private notes don't need moderation hold
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
      void scanContent({
        contentType: 'note',
        contentId: note.id,
        text: textToScan,
        userId: req.user.userId,
      })
    }

    /* Content fingerprinting for plagiarism detection (fire-and-forget) */
    void updateFingerprint('note', note.id, contentStr)

    res.status(201).json(serializeNote(note, { _starred: false }))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * PATCH /api/notes/:id — Update a note
 *
 * Hardening v2: when the client supplies any of `baseRevision`, `saveId`, or
 * `contentHash`, we run the hardened save pipeline (revision gate, idempotent
 * replay, no-op detection, auto-version snapshots). Legacy clients that omit
 * those fields continue through the original flat-response path.
 */
async function updateNote(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  const body = req.body || {}
  // Hardened save path is now the ONLY path. Legacy clients that omit
  // baseRevision / saveId / contentHash / trigger are accepted with defaults:
  //   - missing baseRevision → 0 (stale client; server returns 409 if the row moved)
  //   - missing saveId → server-generated UUID (keeps replay-dedup field populated)
  //   - missing contentHash → recomputed from content
  //   - missing trigger → 'unspecified' (NEVER forces a MANUAL snapshot)
  const normalizedBody = {
    ...body,
    baseRevision: body.baseRevision ?? 0,
    saveId: typeof body.saveId === 'string' && body.saveId ? body.saveId : crypto.randomUUID(),
    trigger: typeof body.trigger === 'string' ? body.trigger : 'unspecified',
  }
  return updateNoteHardened(req, res, noteId, normalizedBody)
}

/**
 * Hardened save path (Notes Hardening v2).
 *
 * Response envelope:
 *   200 — { note, revision, savedAt, versionCreated, noop?, replay? }
 *   202 — replayed saveId (idempotent)
 *   409 — revision conflict { code, current, yours }
 *   413 — content exceeds MAX_NOTE_CONTENT_HARDENED
 */
async function updateNoteHardened(req, res, noteId, body) {
  let { title } = body
  const { content, baseRevision, saveId, contentHash, trigger } = body

  if (typeof content === 'string' && content.length > MAX_NOTE_CONTENT_HARDENED) {
    return sendError(
      res,
      413,
      `Note content exceeds ${MAX_NOTE_CONTENT_HARDENED} characters`,
      ERROR_CODES.NOTE_PAYLOAD_TOO_LARGE,
    )
  }

  // Title validation (hardened path is now the only path)
  if (title !== undefined) {
    const trimmedTitle = typeof title === 'string' ? title.trim() : ''
    if (!trimmedTitle) return sendError(res, 400, 'Title cannot be empty.', ERROR_CODES.BAD_REQUEST)
    if (trimmedTitle.length > 120)
      return sendError(res, 400, 'Title must be 120 characters or fewer.', ERROR_CODES.BAD_REQUEST)
    title = trimmedTitle
  }

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    // Idempotent replay — same saveId already applied
    if (saveId && note.lastSaveId === saveId) {
      return res.status(202).json({
        note: serializeNote(note),
        revision: note.revision,
        savedAt: note.updatedAt,
        versionCreated: false,
        replay: true,
      })
    }

    if (isRevisionConflict(baseRevision ?? 0, note.revision)) {
      return sendError(res, 409, 'Note revision conflict', ERROR_CODES.NOTE_REVISION_CONFLICT, {
        current: {
          revision: note.revision,
          title: note.title,
          content: note.content,
          updatedAt: note.updatedAt,
          contentHash: note.contentHash,
        },
        yours: { title, content },
      })
    }

    // No-op detection: incoming hash + title match current state
    const incomingContent = typeof content === 'string' ? content : note.content
    const normalizedIncomingHash = contentHash || computeContentHash(incomingContent)
    const titleUnchanged = title === undefined || title === note.title
    if (note.contentHash && note.contentHash === normalizedIncomingHash && titleUnchanged) {
      return res.status(200).json({
        note: serializeNote(note),
        revision: note.revision,
        savedAt: note.updatedAt,
        versionCreated: false,
        noop: true,
      })
    }

    const lastAutoVersion = await prisma.noteVersion.findFirst({
      where: { noteId, kind: 'AUTO' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const autoDue = shouldCreateAutoVersion({
      lastAutoVersionAt: lastAutoVersion?.createdAt ?? null,
    })
    const shouldSnapshot = trigger === 'manual' || autoDue

    const updated = await prisma.$transaction(async (tx) => {
      if (shouldSnapshot && (note.title || note.content)) {
        await tx.noteVersion.create({
          data: {
            noteId,
            userId: req.user.userId,
            title: note.title,
            content: note.content ?? '',
            message: trigger === 'manual' ? 'Manual save' : null,
            revision: note.revision,
            kind: trigger === 'manual' ? 'MANUAL' : 'AUTO',
            bytesContent: Buffer.byteLength(note.content ?? '', 'utf8'),
          },
        })
      }

      const data = {
        revision: note.revision + 1,
        lastSaveId: saveId ?? null,
        contentHash: normalizedIncomingHash,
      }
      if (title !== undefined) data.title = title
      if (content !== undefined) data.content = content

      return tx.note.update({
        where: { id: noteId },
        data,
        include: NOTE_INCLUDE,
      })
    })

    // Prune AUTO versions past retention limit (best-effort, post-commit)
    prunePastFiftyAuto(noteId).catch((err) => {
      captureError(err, {
        route: req.originalUrl,
        method: req.method,
        source: 'prunePastFiftyAuto',
      })
    })

    // Async content moderation / fingerprinting — fire-and-forget
    if (isModerationEnabled() && (title !== undefined || content !== undefined)) {
      const textToScan = `${updated.title} ${updated.content || ''}`.trim()
      if (textToScan) {
        void scanContent({
          contentType: 'note',
          contentId: noteId,
          text: textToScan,
          userId: req.user.userId,
        })
      }
    }
    if (content !== undefined) void updateFingerprint('note', noteId, updated.content)

    return res.status(200).json({
      note: serializeNote(updated),
      revision: updated.revision,
      savedAt: updated.updatedAt,
      versionCreated: shouldSnapshot,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function prunePastFiftyAuto(noteId) {
  const autos = await prisma.noteVersion.findMany({
    where: { noteId, kind: 'AUTO' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (autos.length <= AUTO_VERSION_RETENTION) return
  const toDelete = autos.slice(AUTO_VERSION_RETENTION).map((v) => v.id)
  await prisma.noteVersion.deleteMany({ where: { id: { in: toDelete } } })
}

/**
 * DELETE /api/notes/:id — Delete a note
 */
async function deleteNote(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const versions = await prisma.noteVersion.findMany({
      where: { noteId },
      select: { content: true },
    })

    const noteImageUrls = extractNoteImageUrlsFromTexts([
      note.content,
      ...versions.map((version) => version.content),
    ])

    await prisma.note.delete({ where: { id: noteId } })

    const cleanupResults = await Promise.allSettled(
      noteImageUrls.map((imageUrl) =>
        cleanupNoteImageIfUnused(prisma, imageUrl, {
          source: 'deleteNote',
          noteId,
          userId: req.user.userId,
        }),
      ),
    )

    cleanupResults.forEach((result) => {
      if (result.status === 'rejected') {
        captureError(result.reason, {
          source: 'deleteNoteCleanup',
          noteId,
          userId: req.user.userId,
        })
      }
    })

    res.json({ message: 'Note deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * GET /api/notes/:id/comments — List comments on a note
 */
async function listNoteComments(req, res) {
  req._timingStart = Date.now()
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
  const offset = Math.min(10000, Math.max(0, parseInt(req.query.offset, 10) || 0))

  try {
    const noteSection = await timedSection('note-lookup', () =>
      prisma.note.findUnique({
        where: { id: noteId },
        select: { id: true, private: true, userId: true },
      }),
    )
    const note = noteSection.data
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadNote(note, req.user || null))
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)

    const commentWhere = { noteId, parentId: null }

    const [commentsSection, countSection] = await Promise.all([
      timedSection('comments', () =>
        prisma.noteComment.findMany({
          where: commentWhere,
          include: {
            ...COMMENT_INCLUDE,
            attachments: {
              select: { id: true, url: true, type: true, name: true, createdAt: true },
            },
            replies: {
              include: {
                ...COMMENT_INCLUDE,
                attachments: {
                  select: { id: true, url: true, type: true, name: true, createdAt: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
      ),
      timedSection('count', () => prisma.noteComment.count({ where: commentWhere })),
    ])

    // Collect all comment IDs (top-level + replies) for batch reaction lookup
    const allCommentIds = []
    for (const c of commentsSection.data) {
      allCommentIds.push(c.id)
      for (const r of c.replies || []) allCommentIds.push(r.id)
    }

    // Batch fetch reaction counts and user reactions
    const userId = req.user?.userId
    const [reactionGroups, userReactions] = await Promise.all([
      allCommentIds.length > 0
        ? prisma.noteCommentReaction.groupBy({
            by: ['commentId', 'type'],
            where: { commentId: { in: allCommentIds } },
            _count: true,
          })
        : [],
      userId && allCommentIds.length > 0
        ? prisma.noteCommentReaction.findMany({
            where: { commentId: { in: allCommentIds }, userId },
            select: { commentId: true, type: true },
          })
        : [],
    ])

    // Build lookup maps
    const reactionMap = new Map()
    for (const g of reactionGroups) {
      if (!reactionMap.has(g.commentId)) reactionMap.set(g.commentId, { like: 0, dislike: 0 })
      reactionMap.get(g.commentId)[g.type] = g._count
    }
    const userReactionMap = new Map()
    for (const r of userReactions) userReactionMap.set(r.commentId, r.type)

    function enrichComment(c) {
      return {
        ...c,
        reactionCounts: reactionMap.get(c.id) || { like: 0, dislike: 0 },
        userReaction: userReactionMap.get(c.id) || null,
      }
    }

    const comments = commentsSection.data.map((comment) => ({
      ...enrichComment(comment),
      replyCount: (comment.replies || []).length,
      replies: (comment.replies || []).map(enrichComment),
    }))

    logTiming(req, {
      sections: [noteSection, commentsSection, countSection],
      extra: { noteId, commentCount: countSection.data },
    })

    res.json({ comments, total: countSection.data, limit, offset })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/notes/:id/comments — Create a comment on a note
 */
async function createNoteComment(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  const rawContent = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  // Strip HTML tags from comments — comments are plain text only
  const content = rawContent.replace(/<[^>]*>/g, '')
  const parentId = req.body.parentId ? Number.parseInt(req.body.parentId, 10) : null
  const attachmentValidation = normalizeCommentGifAttachments(req.body.attachments)

  if (attachmentValidation.error) {
    return sendError(res, 400, attachmentValidation.error, ERROR_CODES.BAD_REQUEST)
  }

  const { attachments } = attachmentValidation

  if (!content && attachments.length === 0)
    return sendError(res, 400, 'Comment cannot be empty.', ERROR_CODES.BAD_REQUEST)
  if (content.length > 500)
    return sendError(res, 400, 'Comment must be 500 characters or fewer.', ERROR_CODES.BAD_REQUEST)

  // Optional inline anchor fields — validated and context-enriched (only for top-level comments)
  const anchor = parentId ? null : validateAnchorInput(req.body)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, private: true, userId: true, title: true, content: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadNote(note, req.user))
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)

    // Validate parentId if provided (max 1 level deep)
    if (parentId) {
      const parentComment = await prisma.noteComment.findUnique({
        where: { id: parentId },
        select: { id: true, noteId: true, parentId: true },
      })
      if (!parentComment)
        return sendError(res, 400, 'Parent comment not found.', ERROR_CODES.BAD_REQUEST)
      if (parentComment.noteId !== noteId)
        return sendError(
          res,
          400,
          'Parent comment belongs to different note.',
          ERROR_CODES.BAD_REQUEST,
        )
      if (parentComment.parentId !== null)
        return sendError(
          res,
          400,
          'Cannot reply to replies (max 1 level deep).',
          ERROR_CODES.BAD_REQUEST,
        )
    }

    // Build surrounding context for anchor re-matching after edits (only for top-level comments)
    const anchorContext = anchor
      ? buildAnchorContext(note.content, anchor.anchorText, anchor.anchorOffset)
      : null

    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.noteComment.create({
      data: {
        content,
        noteId,
        userId: req.user.userId,
        parentId: parentId || null,
        anchorText: anchor?.anchorText || null,
        anchorOffset: anchor ? anchor.anchorOffset : null,
        anchorContext,
        moderationStatus,
        attachments:
          attachments.length > 0
            ? {
                create: attachments.map((att) => ({
                  url: att.url,
                  type: att.type,
                  name: att.name || '',
                })),
              }
            : undefined,
      },
      include: {
        ...COMMENT_INCLUDE,
        attachments: { select: { id: true, url: true, type: true, name: true } },
      },
    })

    // Async content moderation on comment — fire-and-forget
    if (isModerationEnabled()) {
      void scanContent({
        contentType: 'note_comment',
        contentId: comment.id,
        text: content,
        userId: req.user.userId,
      })
    }

    trackActivity(prisma, req.user.userId, 'comments')

    // Only notify note owner if it's a top-level comment
    if (!parentId && note.userId !== req.user.userId) {
      await createNotification(prisma, {
        userId: note.userId,
        type: 'comment',
        message: `${req.user.username} commented on your note "${note.title}".`,
        actorId: req.user.userId,
        linkPath: `/notes/${noteId}`,
      })
    }

    // Notify parent comment author if it's a reply
    if (parentId) {
      const parentCommentData = await prisma.noteComment.findUnique({
        where: { id: parentId },
        select: { userId: true },
      })
      if (parentCommentData && parentCommentData.userId !== req.user.userId) {
        await createNotification(prisma, {
          userId: parentCommentData.userId,
          type: 'reply',
          message: `${req.user.username} replied to your comment.`,
          actorId: req.user.userId,
          linkPath: `/notes/${noteId}`,
        })
      }
    }

    if (!parentId) {
      await notifyMentionedUsers(prisma, {
        text: content,
        actorId: req.user.userId,
        actorUsername: req.user.username,
        excludeUserIds: [note.userId],
        message: `${req.user.username} mentioned you in a comment on "${note.title}".`,
        linkPath: `/notes/${noteId}`,
      })
    }

    res.status(201).json(comment)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * PATCH /api/notes/:id/comments/:commentId — Resolve/unresolve or edit a comment
 */
async function updateNoteComment(req, res) {
  const noteId = parseInt(req.params.id, 10)
  const commentId = parseInt(req.params.commentId, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.VALIDATION)
  if (!Number.isInteger(commentId) || commentId < 1)
    return sendError(res, 400, 'Invalid comment id.', ERROR_CODES.VALIDATION)

  const { resolved, content } = req.body || {}
  const hasResolved = typeof resolved === 'boolean'
  const hasContent = content !== undefined

  if (!hasResolved && !hasContent) {
    return sendError(
      res,
      400,
      'Provide resolved (boolean) or content (string).',
      ERROR_CODES.VALIDATION,
    )
  }

  try {
    const comment = await prisma.noteComment.findUnique({
      where: { id: commentId },
      include: { note: { select: { id: true, userId: true } } },
    })
    if (!comment || comment.noteId !== noteId) {
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
    }

    const updateData = {}

    // Handle resolve/unresolve — note owner or admin only
    if (hasResolved) {
      const isNoteOwner = req.user.userId === comment.note.userId || req.user.role === 'admin'
      if (!isNoteOwner) {
        return sendError(
          res,
          403,
          'Only the note owner can resolve comments.',
          ERROR_CODES.FORBIDDEN,
        )
      }
      updateData.resolved = resolved
    }

    // Handle content editing — comment author only, 15-minute window
    if (hasContent) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return sendError(res, 400, 'Comment content is required.', ERROR_CODES.VALIDATION)
      }
      if (content.length > 500) {
        return sendError(
          res,
          400,
          'Comment must be 500 characters or fewer.',
          ERROR_CODES.VALIDATION,
        )
      }
      if (comment.userId !== req.user.userId) {
        return sendError(res, 403, 'You can only edit your own comments.', ERROR_CODES.FORBIDDEN)
      }
      const fifteenMinutes = 15 * 60 * 1000
      if (Date.now() - new Date(comment.createdAt).getTime() > fifteenMinutes) {
        return sendError(
          res,
          403,
          'Can only edit comments within 15 minutes.',
          ERROR_CODES.FORBIDDEN,
        )
      }
      updateData.content = content.trim()
    }

    const updated = await prisma.noteComment.update({
      where: { id: commentId },
      data: updateData,
      include: COMMENT_INCLUDE,
    })

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * DELETE /api/notes/:id/comments/:commentId — Delete a comment
 */
async function deleteNoteComment(req, res) {
  const noteId = parseInt(req.params.id, 10)
  const commentId = parseInt(req.params.commentId, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  if (!Number.isInteger(commentId) || commentId < 1)
    return sendError(res, 400, 'Invalid comment id.', ERROR_CODES.BAD_REQUEST)

  try {
    const comment = await prisma.noteComment.findUnique({
      where: { id: commentId },
      include: { note: { select: { id: true, userId: true } } },
    })
    if (!comment || comment.noteId !== noteId)
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)

    // Comment author, note owner, or admin can delete
    const canDelete =
      req.user.userId === comment.userId ||
      req.user.userId === comment.note.userId ||
      req.user.role === 'admin'
    if (!canDelete)
      return sendError(res, 403, 'Not authorized to delete this comment.', ERROR_CODES.FORBIDDEN)

    await prisma.noteComment.delete({ where: { id: commentId } })
    res.json({ message: 'Comment deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/notes/:id/versions — Save a named version snapshot
 */
async function createNoteVersion(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const message =
      typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 200) : null

    const version = await prisma.noteVersion.create({
      data: {
        noteId,
        userId: req.user.userId,
        title: note.title,
        content: note.content,
        message,
        kind: 'MANUAL',
        revision: note.revision ?? 0,
        bytesContent: Buffer.byteLength(note.content ?? '', 'utf8'),
      },
    })

    res.status(201).json(version)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * GET /api/notes/:id/versions — List version history
 */
async function listNoteVersions(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20))
    const versions = await prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        message: true,
        createdAt: true,
        kind: true,
        revision: true,
        bytesContent: true,
      },
    })

    res.json(versions)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * GET /api/notes/:id/versions/:versionId — Get a specific version
 */
async function getNoteVersion(req, res) {
  const noteId = parseInt(req.params.id, 10)
  const versionId = parseInt(req.params.versionId, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  if (!Number.isInteger(versionId) || versionId < 1)
    return sendError(res, 400, 'Invalid version id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const version = await prisma.noteVersion.findUnique({ where: { id: versionId } })
    if (!version || version.noteId !== noteId)
      return sendError(res, 404, 'Version not found.', ERROR_CODES.NOT_FOUND)

    res.json(version)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * GET /api/notes/:id/versions/:versionId/diff — Word-level diff for a version
 * Query: against=current (default) or another versionId
 */
async function getVersionDiff(req, res) {
  const id = parseInt(req.params.id, 10)
  const versionId = parseInt(req.params.versionId, 10)
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(versionId) || versionId < 1) {
    return sendError(res, 400, 'Invalid id', ERROR_CODES.BAD_REQUEST)
  }

  const against = req.query.against || 'current'

  try {
    const note = await prisma.note.findUnique({ where: { id } })
    if (!note) return sendError(res, 404, 'Note not found', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: id,
      })
    )
      return
    const version = await prisma.noteVersion.findUnique({ where: { id: versionId } })
    if (!version || version.noteId !== id) {
      return sendError(res, 404, 'Version not found', ERROR_CODES.NOTE_VERSION_NOT_FOUND)
    }

    let rightText
    if (against === 'current') {
      rightText = note.content ?? ''
    } else {
      const otherId = parseInt(against, 10)
      if (!Number.isInteger(otherId) || otherId < 1) {
        return sendError(res, 400, 'Invalid against parameter', ERROR_CODES.BAD_REQUEST)
      }
      const other = await prisma.noteVersion.findUnique({ where: { id: otherId } })
      if (!other || other.noteId !== id) {
        return sendError(
          res,
          404,
          'Comparison version not found',
          ERROR_CODES.NOTE_VERSION_NOT_FOUND,
        )
      }
      rightText = other.content ?? ''
    }

    const result = buildWordDiff(version.content ?? '', rightText)
    res.set('Cache-Control', 'private, max-age=60')
    return res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/notes/:id/versions/:versionId/restore — Restore a version
 */
async function restoreNoteVersion(req, res) {
  const noteId = parseInt(req.params.id, 10)
  const versionId = parseInt(req.params.versionId, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  if (!Number.isInteger(versionId) || versionId < 1)
    return sendError(res, 400, 'Invalid version id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const version = await prisma.noteVersion.findUnique({ where: { id: versionId } })
    if (!version || version.noteId !== noteId) {
      return sendError(res, 404, 'Version not found.', ERROR_CODES.NOTE_VERSION_NOT_FOUND)
    }

    const versionCreatedAtIso =
      version.createdAt instanceof Date
        ? version.createdAt.toISOString()
        : new Date(version.createdAt).toISOString()

    const updated = await prisma.$transaction(async (tx) => {
      await tx.noteVersion.create({
        data: {
          noteId,
          userId: req.user.userId,
          title: note.title,
          content: note.content,
          message: `Before restore to ${versionCreatedAtIso}`,
          revision: note.revision,
          parentVersionId: version.id,
          kind: 'PRE_RESTORE',
          bytesContent: Buffer.byteLength(note.content ?? '', 'utf8'),
        },
      })
      return tx.note.update({
        where: { id: noteId },
        data: {
          title: version.title,
          content: version.content,
          revision: (note.revision ?? 0) + 1,
          contentHash: computeContentHash(version.content ?? ''),
          lastSaveId: null,
        },
      })
    })

    return res.json({ note: updated, revision: updated.revision })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/notes/:id/star — Star a note
 */
async function starNote(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, private: true, userId: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadNote(note, req.user))
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)

    const existing = await prisma.noteStar.findUnique({
      where: { userId_noteId: { userId: req.user.userId, noteId } },
    })
    if (existing) return res.json({ starred: true })

    await prisma.noteStar.create({ data: { userId: req.user.userId, noteId } })
    res.json({ starred: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * DELETE /api/notes/:id/star — Unstar a note
 */
async function unstarNote(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    await prisma.noteStar.deleteMany({ where: { userId: req.user.userId, noteId } })
    res.json({ starred: false })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * PATCH /api/notes/:id/pin — Toggle pinned status
 */
async function toggleNotePin(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true, pinned: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const pinned = req.body.pinned !== undefined ? Boolean(req.body.pinned) : !note.pinned
    const updated = await prisma.note.update({ where: { id: noteId }, data: { pinned } })
    res.json({ pinned: updated.pinned })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * PATCH /api/notes/:id/tags — Update tags
 */
async function updateNoteTags(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    const tags = Array.isArray(req.body.tags) ? req.body.tags : []
    // Sanitize: max 10 tags, each max 30 chars, lowercase trimmed, unique
    const cleaned = [
      ...new Set(
        tags
          .map((t) => (typeof t === 'string' ? t.trim().toLowerCase().slice(0, 30) : ''))
          .filter(Boolean),
      ),
    ].slice(0, 10)

    const updated = await prisma.note.update({
      where: { id: noteId },
      data: { tags: JSON.stringify(cleaned) },
    })
    res.json({ tags: JSON.parse(updated.tags) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/notes/:id/images — Upload an image for embedding
 */
async function uploadNoteImage(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  if (!req.file) {
    return res
      .status(400)
      .json({ error: 'No image file attached. Use multipart/form-data with field name "image".' })
  }

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    // Return the URL for markdown embedding
    const imageUrl = `/uploads/note-images/${req.file.filename}`
    res.status(201).json({ url: imageUrl, markdown: `![image](${imageUrl})` })
  } catch (uploadErr) {
    captureError(uploadErr, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function appendChunk(req, res) {
  const { saveId, chunkIndex, chunkCount, chunk, baseRevision, contentHash, title } = req.body ?? {}
  if (
    !saveId ||
    typeof chunkIndex !== 'number' ||
    typeof chunkCount !== 'number' ||
    typeof chunk !== 'string'
  ) {
    return sendError(res, 400, 'Invalid chunk payload', ERROR_CODES.BAD_REQUEST)
  }
  let result
  try {
    result = defaultChunkBuffer.append(req.user.userId, saveId, chunkIndex, chunkCount, chunk)
  } catch (e) {
    return sendError(res, 400, e.message, ERROR_CODES.NOTE_CHUNK_OUT_OF_ORDER)
  }
  if (!result.complete) {
    return res.status(202).json({ received: chunkIndex + 1, total: chunkCount })
  }
  // Delegate to updateNote() with the assembled content. Use trigger='debounce'
  // since chunked saves come from the autosave path.
  req.body = {
    title,
    content: result.content,
    baseRevision,
    saveId,
    contentHash,
    trigger: 'debounce',
  }
  return updateNote(req, res)
}

/**
 * PATCH /api/notes/:id/metadata — Update privacy / course / allowDownloads
 *
 * Why a dedicated endpoint (parallels /star, /pin, /tags) instead of
 * piggy-backing on PATCH /:id ?
 *   1. The hardened content-save path runs revision-conflict + content-hash
 *      no-op detection that would suppress a metadata-only change whenever
 *      the body content was unchanged.
 *   2. Toggling Private should NOT create a NoteVersion snapshot.
 *   3. The frontend was previously updating these fields in local React
 *      state only — the values never reached the server. After reload the
 *      Private/Course/Downloads selectors snapped back to their persisted
 *      values, which made the controls look broken.
 *
 * Body: { private?: boolean, courseId?: number|null, allowDownloads?: boolean }
 * Returns: 200 { note } with the updated row.
 */
async function updateNoteMetadata(req, res) {
  const noteId = parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1)
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)

  const body = req.body || {}
  const data = {}

  if (Object.prototype.hasOwnProperty.call(body, 'private')) {
    if (typeof body.private !== 'boolean') {
      return sendError(res, 400, 'private must be a boolean.', ERROR_CODES.BAD_REQUEST)
    }
    data.private = body.private
    // Mirrors the existing client behavior: going private hides downloads.
    if (body.private === true) data.allowDownloads = false
  }

  if (Object.prototype.hasOwnProperty.call(body, 'allowDownloads')) {
    if (typeof body.allowDownloads !== 'boolean') {
      return sendError(res, 400, 'allowDownloads must be a boolean.', ERROR_CODES.BAD_REQUEST)
    }
    // The private:true branch above takes precedence — don't overwrite it.
    if (data.allowDownloads === undefined) data.allowDownloads = body.allowDownloads
  }

  if (Object.prototype.hasOwnProperty.call(body, 'courseId')) {
    if (body.courseId === null || body.courseId === '') {
      data.courseId = null
    } else {
      const courseId = Number.parseInt(body.courseId, 10)
      if (!Number.isInteger(courseId) || courseId < 1) {
        return sendError(
          res,
          400,
          'courseId must be a positive integer or null.',
          ERROR_CODES.BAD_REQUEST,
        )
      }
      data.courseId = courseId
    }
  }

  if (Object.keys(data).length === 0) {
    return sendError(
      res,
      400,
      'Provide at least one of private, allowDownloads, courseId.',
      ERROR_CODES.BAD_REQUEST,
    )
  }

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true },
    })
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: note.userId,
        message: 'Not your note.',
        targetType: 'note',
        targetId: noteId,
      })
    )
      return

    // If a courseId was supplied, verify the user is actually enrolled in
    // that course. Without this check a note could be filed under a
    // course the user has no access to, leaking it onto that course's
    // sidebar listing.
    if (data.courseId != null) {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: req.user.userId, courseId: data.courseId },
        select: { id: true },
      })
      if (!enrollment && req.user.role !== 'admin') {
        return sendError(res, 403, 'You are not enrolled in that course.', ERROR_CODES.FORBIDDEN)
      }
    }

    const updated = await prisma.note.update({
      where: { id: noteId },
      data,
      include: NOTE_INCLUDE,
    })
    return res.status(200).json({ note: serializeNote(updated) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  getNoteById,
  listNotes,
  createNote,
  updateNote,
  updateNoteMetadata,
  deleteNote,
  listNoteComments,
  createNoteComment,
  updateNoteComment,
  deleteNoteComment,
  createNoteVersion,
  listNoteVersions,
  getNoteVersion,
  getVersionDiff,
  restoreNoteVersion,
  starNote,
  unstarNote,
  toggleNotePin,
  updateNoteTags,
  uploadNoteImage,
  appendChunk,
}
