/**
 * scholar.annotation.controller.js — Highlight / margin-note CRUD.
 *
 * Visibility:
 *   - 'private' (default): owner only
 *   - 'school': any authenticated viewer in the same school as the owner
 *   - 'public': any authenticated viewer
 *
 * Defense in depth (CLAUDE.md A6):
 *   - Frontend hides foreign annotations when not allowed.
 *   - Backend filter on GET strips rows the viewer can't see.
 *   - Serializer strips body / userId / rangeJson on returned rows that
 *     the viewer is not the owner of when visibility is 'private' (so
 *     only counts/colors/positions remain — kept for UI markers but no
 *     content leak).
 *
 * `body` is plain text only (we strip HTML/scripts at the boundary)
 * because the field is rendered as `textContent` on the frontend, never
 * as HTML. `color` and `visibility` are enum-allowlisted (CLAUDE.md A13).
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { CANONICAL_ID_RE } = require('./scholar.constants')

const COLOR_ALLOWLIST = new Set(['yellow', 'green', 'blue', 'pink', 'purple', 'orange'])
const VISIBILITY_ALLOWLIST = new Set(['private', 'school', 'public'])
const BODY_MAX_LENGTH = 2000

function _stripText(raw) {
  if (typeof raw !== 'string') return ''
  // Strip HTML tags + control chars; collapse whitespace; truncate.
  // The body is rendered as plain text, so anything <…> is unwanted.
  let cleaned = raw.replace(/<[^>]*>/g, ' ')
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, BODY_MAX_LENGTH)
}

function _validatePaperId(raw) {
  if (typeof raw !== 'string') return null
  if (raw.length > 256) return null
  // Reject control chars + nulls; DOI legitimately contains `/` so we
  // do not strip it. Belt-and-suspenders per Loop-3 LOW-2.
  // eslint-disable-next-line no-control-regex
  if (/[\r\n\x00]/.test(raw)) return null
  return CANONICAL_ID_RE.test(raw) ? raw : null
}

function _validateRangeJson(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  // Cap shape size — anchor / focus / page indices, with optional text snippet.
  // Reject if serialized > 4 KB to prevent unbounded JSONB writes.
  let serialized
  try {
    serialized = JSON.stringify(raw)
  } catch {
    return null
  }
  if (serialized.length > 4096) return null
  return raw
}

function _serializeOne(row, viewerId) {
  if (!row) return null
  const isOwner = viewerId && row.userId === viewerId
  if (isOwner) {
    return {
      id: row.id,
      paperId: row.paperId,
      userId: row.userId,
      rangeJson: row.rangeJson,
      body: row.body,
      color: row.color,
      visibility: row.visibility,
      createdAt: row.createdAt?.toISOString?.() || row.createdAt || null,
      updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt || null,
      isOwner: true,
    }
  }
  // Non-owner sees position + color only (so highlight markers render
  // for school/public visibility), no body/userId/range. Loop-3 LOW-4.
  return {
    id: row.id,
    paperId: row.paperId,
    color: row.color,
    visibility: row.visibility,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt || null,
    isOwner: false,
  }
}

// ── Handlers ────────────────────────────────────────────────────────────

async function listAnnotations(req, res) {
  try {
    const paperId = _validatePaperId(req.query.paperId)
    if (!paperId) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    const viewerId = req.user?.userId || null
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, viewerId)
    } catch (err) {
      log.warn(
        { event: 'scholar.annotation.block_filter_failed', err: err.message },
        'block filter degraded; continuing without filter',
      )
    }

    // L13-HIGH-3: 'school' visibility was leaking cross-school. Resolve
    // viewer's school so 'school'-tier annotations are filtered to authors
    // enrolled in the SAME school. 'public' stays globally visible; 'private'
    // is owner-only via the userId branch.
    let viewerSchoolId = null
    if (viewerId) {
      try {
        const enrollment = await prisma.userSchoolEnrollment.findFirst({
          where: { userId: viewerId },
          orderBy: { createdAt: 'asc' },
          select: { schoolId: true },
        })
        viewerSchoolId = enrollment?.schoolId ?? null
      } catch (err) {
        log.warn(
          { event: 'scholar.annotation.school_resolve_failed', err: err.message },
          'school resolve degraded; school-tier annotations omitted for this viewer',
        )
      }
    }

    const visibilityClause = viewerId
      ? {
          OR: [
            { userId: viewerId },
            { visibility: 'public' },
            ...(viewerSchoolId
              ? [
                  {
                    visibility: 'school',
                    // Loop-2-CRIT + Loop-8-CRIT: User has `schoolEnrollments`
                    // (UserSchoolEnrollment[]), NOT `enrollments` (which is the
                    // course-level Enrollment[]). The wrong relation name would
                    // throw PrismaClientValidationError at runtime.
                    user: {
                      schoolEnrollments: { some: { schoolId: viewerSchoolId } },
                    },
                  },
                ]
              : []),
          ],
        }
      : { visibility: 'public' }

    const rows = await prisma.scholarAnnotation.findMany({
      where: {
        paperId,
        ...visibilityClause,
        ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const annotations = rows.map((row) => _serializeOne(row, viewerId))
    res.json({ annotations })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.annotation.list_failed' }, 'Annotation list failed')
    return sendError(res, 500, 'Failed to load annotations.', ERROR_CODES.INTERNAL)
  }
}

async function createAnnotation(req, res) {
  try {
    const { paperId, rangeJson, body, color, visibility } = req.body || {}
    const validId = _validatePaperId(paperId)
    if (!validId) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    const validRange = _validateRangeJson(rangeJson)
    if (!validRange) {
      return sendError(res, 400, 'Invalid rangeJson.', ERROR_CODES.BAD_REQUEST)
    }
    const validColor = typeof color === 'string' && COLOR_ALLOWLIST.has(color) ? color : 'yellow'
    const validVisibility =
      typeof visibility === 'string' && VISIBILITY_ALLOWLIST.has(visibility)
        ? visibility
        : 'private'
    const cleanBody = body == null ? null : _stripText(body) || null

    // Ensure the paper row exists (annotations FK to ScholarPaper). We
    // upsert a minimal placeholder if the user is annotating before the
    // paper detail has been hydrated. Keeps annotation creation resilient
    // for offline / first-load races.
    try {
      await prisma.scholarPaper.upsert({
        where: { id: validId },
        update: {},
        create: {
          id: validId,
          title: '(pending hydration)',
          authorsJson: [],
          topicsJson: [],
          fetchedAt: new Date(),
          staleAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
    } catch (err) {
      log.warn(
        { event: 'scholar.annotation.paper_upsert_failed', err: err.message },
        'paper placeholder upsert failed',
      )
    }

    const row = await prisma.scholarAnnotation.create({
      data: {
        userId: req.user.userId,
        paperId: validId,
        rangeJson: validRange,
        body: cleanBody,
        color: validColor,
        visibility: validVisibility,
      },
    })
    res.status(201).json({ annotation: _serializeOne(row, req.user.userId) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.annotation.create_failed' }, 'Annotation create failed')
    return sendError(res, 500, 'Failed to save annotation.', ERROR_CODES.INTERNAL)
  }
}

async function updateAnnotation(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'Invalid annotation id.', ERROR_CODES.BAD_REQUEST)
    }
    const existing = await prisma.scholarAnnotation.findUnique({ where: { id } })
    if (!existing) {
      return sendError(res, 404, 'Annotation not found.', ERROR_CODES.NOT_FOUND)
    }
    if (existing.userId !== req.user.userId) {
      return sendError(res, 403, 'Cannot edit another user’s annotation.', ERROR_CODES.FORBIDDEN)
    }

    const patch = {}
    const { body, color, visibility } = req.body || {}
    if (body !== undefined) {
      patch.body = body == null ? null : _stripText(body) || null
    }
    if (color !== undefined) {
      if (typeof color !== 'string' || !COLOR_ALLOWLIST.has(color)) {
        return sendError(res, 400, 'Invalid color.', ERROR_CODES.BAD_REQUEST)
      }
      patch.color = color
    }
    if (visibility !== undefined) {
      if (typeof visibility !== 'string' || !VISIBILITY_ALLOWLIST.has(visibility)) {
        return sendError(res, 400, 'Invalid visibility.', ERROR_CODES.BAD_REQUEST)
      }
      patch.visibility = visibility
    }
    if (Object.keys(patch).length === 0) {
      return res.json({ annotation: _serializeOne(existing, req.user.userId) })
    }

    const updated = await prisma.scholarAnnotation.update({
      where: { id },
      data: patch,
    })
    res.json({ annotation: _serializeOne(updated, req.user.userId) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.annotation.update_failed' }, 'Annotation update failed')
    return sendError(res, 500, 'Failed to update annotation.', ERROR_CODES.INTERNAL)
  }
}

async function deleteAnnotation(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'Invalid annotation id.', ERROR_CODES.BAD_REQUEST)
    }
    const existing = await prisma.scholarAnnotation.findUnique({ where: { id } })
    if (!existing) {
      return sendError(res, 404, 'Annotation not found.', ERROR_CODES.NOT_FOUND)
    }
    if (existing.userId !== req.user.userId) {
      return sendError(res, 403, 'Cannot delete another user’s annotation.', ERROR_CODES.FORBIDDEN)
    }
    await prisma.scholarAnnotation.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.annotation.delete_failed' }, 'Annotation delete failed')
    return sendError(res, 500, 'Failed to delete annotation.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  listAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  _serializeOne,
  _stripText,
  _validatePaperId,
  _validateRangeJson,
}
