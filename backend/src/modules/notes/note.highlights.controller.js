/**
 * note.highlights.controller.js — Note Review v1 highlight CRUD.
 *
 * Endpoints mounted under /api/notes/:noteId/highlights:
 *   GET    /           list highlights on a note (auth-required)
 *   POST   /           create a highlight
 *   DELETE /:id        delete a highlight
 *
 * Visibility model:
 *   - Private note: only the note owner (and admins) can read or
 *     write highlights.
 *   - Public/shared note (note.private === false): any authenticated
 *     viewer can read; any authenticated viewer can create; only the
 *     highlight author OR the note owner (or admin) can delete.
 *
 * Defense-in-depth (CLAUDE.md A6 + A12 + A13):
 *   - URL :noteId and :id parsed with Number.parseInt(_, 10) +
 *     Number.isInteger guard before touching Prisma.
 *   - `color` is enum-allowlisted; default 'yellow' on missing input.
 *   - All user-submitted text passes through `_stripText` (HTML tags
 *     and control chars stripped, length-capped). The frontend always
 *     renders the value as `textContent`, never via
 *     dangerouslySetInnerHTML — but stripping at the boundary is the
 *     load-bearing defense against future renderer regressions and is
 *     what the Note Review security addendum requires.
 *   - Block-filter wrap on list: blocked users' highlights are hidden
 *     from the viewer's response. The blockFilter helper is wrapped in
 *     try/catch with empty-array fallback (CLAUDE.md A6).
 *   - originAllowlist is applied at the route layer on POST + DELETE.
 *
 * Anchor model:
 *   - `anchorOffset` is the integer character offset into the rendered
 *     plain-text of the note body where the highlight starts.
 *   - `anchorText` is the verbatim selected text (capped). The
 *     frontend layer uses anchorText for fuzzy re-anchoring if the
 *     note body has been edited since the highlight was made.
 *   - `anchorContext` is an optional short prefix+suffix window used
 *     as a tie-breaker when anchorText appears multiple times.
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')
const { getBlockedUserIds, isBlockedEitherWay } = require('../../lib/social/blockFilter')

const COLOR_ALLOWLIST = new Set(['yellow', 'green', 'blue', 'pink', 'purple'])
const ANCHOR_TEXT_MAX = 2000
const ANCHOR_CONTEXT_MAX = 400
// 4 MB is the conservative server-side ceiling on a note body; offsets
// past that can't be legitimate. Keeping the guard tight prevents
// silly-large integer writes regardless of what the client sends.
const MAX_ANCHOR_OFFSET = 4_000_000

function _stripText(raw, max) {
  if (typeof raw !== 'string') return ''
  let cleaned = raw.replace(/<[^>]*>/g, ' ')
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, max)
}

function _canReadNote(note, user) {
  if (!note) return false
  if (!note.private) return Boolean(user)
  return Boolean(user && (user.userId === note.userId || user.role === 'admin'))
}

function _serializeOne(row) {
  if (!row) return null
  return {
    id: row.id,
    noteId: row.noteId,
    userId: row.userId,
    anchorText: row.anchorText,
    anchorOffset: row.anchorOffset,
    anchorContext: row.anchorContext,
    color: row.color,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt || null,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt || null,
    author: row.user
      ? {
          id: row.user.id,
          username: row.user.username,
          avatarUrl: row.user.avatarUrl,
        }
      : null,
  }
}

// ── Handlers ────────────────────────────────────────────────────────────

async function listHighlights(req, res) {
  const noteId = Number.parseInt(req.params.noteId, 10)
  if (!Number.isInteger(noteId) || noteId < 1) {
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true, private: true },
    })
    if (!note) {
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    }
    if (!_canReadNote(note, req.user)) {
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    }

    const viewerId = req.user?.userId || null
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, viewerId)
    } catch (err) {
      log.warn(
        { event: 'note.highlight.block_filter_failed', err: err.message },
        'block filter degraded; continuing without filter',
      )
    }

    const rows = await prisma.noteHighlight.findMany({
      where: {
        noteId,
        ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({ highlights: rows.map(_serializeOne) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'note.highlight.list_failed' }, 'Highlight list failed')
    return sendError(res, 500, 'Failed to load highlights.', ERROR_CODES.INTERNAL)
  }
}

async function createHighlight(req, res) {
  const noteId = Number.parseInt(req.params.noteId, 10)
  if (!Number.isInteger(noteId) || noteId < 1) {
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  }

  const { anchorText, anchorOffset, anchorContext, color } = req.body || {}

  const cleanAnchorText = _stripText(anchorText, ANCHOR_TEXT_MAX)
  if (!cleanAnchorText) {
    return sendError(
      res,
      400,
      'anchorText is required and must be non-empty.',
      ERROR_CODES.BAD_REQUEST,
    )
  }

  const offsetNum =
    typeof anchorOffset === 'number' ? anchorOffset : Number.parseInt(anchorOffset, 10)
  if (!Number.isInteger(offsetNum) || offsetNum < 0 || offsetNum > MAX_ANCHOR_OFFSET) {
    return sendError(
      res,
      400,
      'anchorOffset must be a non-negative integer.',
      ERROR_CODES.BAD_REQUEST,
    )
  }

  const cleanAnchorContext =
    anchorContext == null ? null : _stripText(anchorContext, ANCHOR_CONTEXT_MAX) || null

  const validColor = typeof color === 'string' && COLOR_ALLOWLIST.has(color) ? color : 'yellow'

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true, private: true },
    })
    if (!note) {
      return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    }

    // Authorization: private notes are owner-only; public/shared notes
    // accept highlights from any authenticated user. The route-level
    // requireAuth middleware guarantees req.user is present here.
    const isOwner = req.user.userId === note.userId
    const isAdmin = req.user.role === 'admin'
    if (note.private && !isOwner && !isAdmin) {
      return sendError(res, 403, 'You cannot highlight a private note.', ERROR_CODES.FORBIDDEN)
    }

    // Block-filter on CREATE (wave-11 G1-2). Pre-this-wave, the
    // controller only filtered blocked users out of the LIST response —
    // a blocked reviewer could still write highlights that the owner
    // never saw. Now a blocked reviewer is rejected at write time too.
    // Wrapped in try/catch with fail-open per CLAUDE.md A6: if the
    // block tables are unavailable, allow the write rather than 503
    // every highlight create. The list-side filter still removes them
    // from the owner's view.
    if (!isOwner) {
      try {
        const blocked = await isBlockedEitherWay(prisma, req.user.userId, note.userId)
        if (blocked) {
          return sendError(res, 403, 'You cannot highlight this note.', ERROR_CODES.FORBIDDEN)
        }
      } catch {
        /* graceful — block table unavailable, allow write */
      }
    }

    const row = await prisma.noteHighlight.create({
      data: {
        noteId,
        userId: req.user.userId,
        anchorText: cleanAnchorText,
        anchorOffset: offsetNum,
        anchorContext: cleanAnchorContext,
        color: validColor,
      },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.status(201).json({ highlight: _serializeOne(row) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'note.highlight.create_failed' }, 'Highlight create failed')
    return sendError(res, 500, 'Failed to save highlight.', ERROR_CODES.INTERNAL)
  }
}

async function deleteHighlight(req, res) {
  const noteId = Number.parseInt(req.params.noteId, 10)
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(noteId) || noteId < 1) {
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  }
  if (!Number.isInteger(id) || id < 1) {
    return sendError(res, 400, 'Invalid highlight id.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const existing = await prisma.noteHighlight.findUnique({
      where: { id },
      select: {
        id: true,
        noteId: true,
        userId: true,
        note: { select: { userId: true } },
      },
    })
    if (!existing || existing.noteId !== noteId) {
      return sendError(res, 404, 'Highlight not found.', ERROR_CODES.NOT_FOUND)
    }

    const isHighlightAuthor = existing.userId === req.user.userId
    const isNoteOwner = existing.note?.userId === req.user.userId
    const isAdmin = req.user.role === 'admin'
    if (!isHighlightAuthor && !isNoteOwner && !isAdmin) {
      return sendError(
        res,
        403,
        'Only the highlight author or the note owner can remove this highlight.',
        ERROR_CODES.FORBIDDEN,
      )
    }

    await prisma.noteHighlight.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'note.highlight.delete_failed' }, 'Highlight delete failed')
    return sendError(res, 500, 'Failed to delete highlight.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  listHighlights,
  createHighlight,
  deleteHighlight,
  _stripText,
  _serializeOne,
  COLOR_ALLOWLIST,
}
