/**
 * scholar.discussion.controller.js — Per-paper peer-review threads.
 *
 * Threads are school-scoped: a viewer sees posts authored by users in
 * the same school as themselves, plus their own. We resolve the
 * viewer's primary school via UserSchoolEnrollment; if no enrollment
 * is found, we fall back to "global only" (posts without a schoolId).
 *
 * Soft delete via `deletedAt` so reply trees stay intact (CLAUDE.md
 * pattern). Author can soft-delete their own root or reply.
 *
 * Block filter wraps `getBlockedUserIds` in try-catch (CLAUDE.md rule
 * for block/mute helpers).
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { CANONICAL_ID_RE } = require('./scholar.constants')

const BODY_MAX_LENGTH = 4000

function _stripText(raw) {
  if (typeof raw !== 'string') return ''
  let cleaned = raw.replace(/<[^>]*>/g, ' ')
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  cleaned = cleaned
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned.slice(0, BODY_MAX_LENGTH)
}

function _validatePaperIdParam(raw) {
  if (typeof raw !== 'string') return null
  const decoded = (() => {
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  })()
  if (!decoded || decoded.length > 256) return null
  return CANONICAL_ID_RE.test(decoded) ? decoded : null
}

async function _resolveViewerSchoolId(userId) {
  if (!userId) return null
  try {
    const enrollment = await prisma.userSchoolEnrollment.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { schoolId: true },
    })
    return enrollment?.schoolId ?? null
  } catch (err) {
    log.warn(
      { event: 'scholar.discussion.school_resolve_failed', err: err.message },
      'school resolve degraded; falling back to global threads',
    )
    return null
  }
}

function _serializeThread(row, viewerId, authorMap) {
  if (!row) return null
  const author = authorMap.get(row.authorId)
  return {
    id: row.id,
    paperId: row.paperId,
    authorId: row.authorId,
    author: author
      ? {
          id: author.id,
          username: author.username,
          displayName: author.displayName || author.username,
          avatarUrl: author.avatarUrl || null,
        }
      : null,
    body: row.deletedAt ? null : row.body,
    parentId: row.parentId,
    deleted: Boolean(row.deletedAt),
    createdAt: row.createdAt?.toISOString?.() || row.createdAt || null,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt || null,
    isOwner: viewerId && row.authorId === viewerId,
  }
}

// ── Handlers ────────────────────────────────────────────────────────────

async function listDiscussions(req, res) {
  try {
    const paperId = _validatePaperIdParam(req.params.id)
    if (!paperId) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const viewerId = req.user?.userId || null
    const viewerSchoolId = await _resolveViewerSchoolId(viewerId)

    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, viewerId)
    } catch (err) {
      log.warn(
        { event: 'scholar.discussion.block_filter_failed', err: err.message },
        'block filter degraded; continuing without filter',
      )
    }

    // Threads visible to this viewer:
    //  - same schoolId as viewer (school-scoped)
    //  - schoolId = null (global)
    //  - authored by viewer (always visible)
    const schoolClause = viewerId
      ? {
          OR: [
            ...(viewerSchoolId ? [{ schoolId: viewerSchoolId }] : []),
            { schoolId: null },
            { authorId: viewerId },
          ],
        }
      : { schoolId: null }

    const rows = await prisma.scholarDiscussionThread.findMany({
      where: {
        paperId,
        ...schoolClause,
        ...(blockedIds.length ? { authorId: { notIn: blockedIds } } : {}),
      },
      orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    })

    const authorIds = Array.from(new Set(rows.map((r) => r.authorId).filter(Boolean)))
    const authors = authorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        })
      : []
    const authorMap = new Map(authors.map((a) => [a.id, a]))

    const threads = rows.map((row) => _serializeThread(row, viewerId, authorMap))
    res.json({ threads })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.discussion.list_failed' }, 'Discussion list failed')
    return sendError(res, 500, 'Failed to load discussion.', ERROR_CODES.INTERNAL)
  }
}

async function createDiscussion(req, res) {
  try {
    const paperId = _validatePaperIdParam(req.params.id)
    if (!paperId) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const { body, parentId } = req.body || {}
    const cleanBody = _stripText(body)
    if (!cleanBody || cleanBody.length < 1) {
      return sendError(res, 400, 'Body required.', ERROR_CODES.VALIDATION)
    }
    let resolvedParentId = null
    if (parentId !== undefined && parentId !== null) {
      const pid = Number.parseInt(parentId, 10)
      if (!Number.isInteger(pid) || pid < 1) {
        return sendError(res, 400, 'Invalid parentId.', ERROR_CODES.BAD_REQUEST)
      }
      const parent = await prisma.scholarDiscussionThread.findUnique({
        where: { id: pid },
        select: { id: true, paperId: true },
      })
      if (!parent || parent.paperId !== paperId) {
        return sendError(res, 404, 'Parent thread not found.', ERROR_CODES.NOT_FOUND)
      }
      resolvedParentId = parent.id
    }

    const viewerSchoolId = await _resolveViewerSchoolId(req.user.userId)

    // Ensure the paper row exists (FK).
    try {
      await prisma.scholarPaper.upsert({
        where: { id: paperId },
        update: {},
        create: {
          id: paperId,
          title: '(pending hydration)',
          authorsJson: [],
          topicsJson: [],
          fetchedAt: new Date(),
          staleAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
    } catch (err) {
      log.warn(
        { event: 'scholar.discussion.paper_upsert_failed', err: err.message },
        'paper placeholder upsert failed',
      )
    }

    const row = await prisma.scholarDiscussionThread.create({
      data: {
        paperId,
        schoolId: viewerSchoolId || null,
        authorId: req.user.userId,
        body: cleanBody,
        parentId: resolvedParentId,
      },
    })
    const author = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    })
    const authorMap = new Map(author ? [[author.id, author]] : [])
    res.status(201).json({ thread: _serializeThread(row, req.user.userId, authorMap) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.discussion.create_failed' }, 'Discussion create failed')
    return sendError(res, 500, 'Failed to post discussion.', ERROR_CODES.INTERNAL)
  }
}

async function deleteDiscussion(req, res) {
  try {
    const paperId = _validatePaperIdParam(req.params.id)
    if (!paperId) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const threadId = Number.parseInt(req.params.threadId, 10)
    if (!Number.isInteger(threadId) || threadId < 1) {
      return sendError(res, 400, 'Invalid thread id.', ERROR_CODES.BAD_REQUEST)
    }
    const existing = await prisma.scholarDiscussionThread.findUnique({ where: { id: threadId } })
    if (!existing || existing.paperId !== paperId || existing.deletedAt) {
      return sendError(res, 404, 'Thread not found.', ERROR_CODES.NOT_FOUND)
    }
    if (existing.authorId !== req.user.userId) {
      return sendError(res, 403, 'Cannot delete another user’s post.', ERROR_CODES.FORBIDDEN)
    }
    await prisma.scholarDiscussionThread.update({
      where: { id: threadId },
      data: { deletedAt: new Date() },
    })
    res.status(204).end()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.discussion.delete_failed' }, 'Discussion delete failed')
    return sendError(res, 500, 'Failed to delete post.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  listDiscussions,
  createDiscussion,
  deleteDiscussion,
  _serializeThread,
  _stripText,
  _validatePaperIdParam,
}
