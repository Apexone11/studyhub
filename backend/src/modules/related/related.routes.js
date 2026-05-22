/**
 * related.routes.js — Ecosystem Track 5 endpoint (wave-12.3, 2026-05-16).
 *
 * Returns a small "Related work" list for a given entity (sheet, note,
 * paper, book). Powers the RelatedWorkStrip on detail pages without
 * forcing each page to roll its own ad-hoc query.
 *
 * Response shape:
 *   { items: [{ type, id, title, subtitle, href }] }
 *
 * Hard cap of 8 items total so the strip stays compact. Block-filter
 * applied to all queries (try-catch fail-open per the established
 * graceful-degradation pattern).
 */
const express = require('express')
const optionalAuth = require('../../core/auth/optionalAuth')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { relatedReadLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

const MAX_ITEMS_PER_BUCKET = 4
const MAX_TOTAL_ITEMS = 8

// paperId / volumeId come from external sources (Scholar API / Google
// Books). They're opaque strings but we still validate the charset to
// keep log lines + cache keys clean and reject obvious shell/SQL probes.
// Real values are URL-safe; permissive enough not to break legit IDs.
const OPAQUE_ID_REGEX = /^[A-Za-z0-9._:-]+$/

// Defense-in-depth: every response from this router depends on the
// viewer's block list (via getBlockedUserIds). Browser cache could
// serve a blocked-user row to whoever uses the browser next on a
// shared device. Explicit no-store cuts that off even though we don't
// emit cacheControl headers — some proxies still apply heuristics.
function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store')
  next()
}

router.use(relatedReadLimiter, noStore)

async function getBlockedSafe(userId) {
  if (!userId) return []
  try {
    return await getBlockedUserIds(prisma, userId)
  } catch {
    return []
  }
}

function notInClause(blockedIds) {
  return blockedIds.length > 0 ? { notIn: blockedIds } : undefined
}

// ── GET /api/related/sheet/:id ───────────────────────────────────────
// For a sheet: pull other published sheets in the same course (sibling
// sheets) + notes that point AT this sheet via `relatedSheetId`.
router.get(
  '/sheet/:id',
  // No cacheControl: the response depends on the viewer's block list
  // (via getBlockedUserIds). Browser cache could serve blocked-user
  // rows to someone who blocks them on shared-browser machines.
  // Loop 2 security finding 2026-05-16.
  optionalAuth,
  async (req, res) => {
    const sheetId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(sheetId) || sheetId < 1) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }
    try {
      const sheet = await prisma.studySheet.findUnique({
        where: { id: sheetId },
        select: {
          id: true,
          courseId: true,
          libraryVolumeId: true,
          derivedFromPaperId: true,
          status: true,
          userId: true,
        },
      })
      if (!sheet) return res.json({ items: [] })

      // Visibility gate: unpublished sheets only expose related work to
      // their owner. Returning empty to anyone else avoids leaking the
      // sheet's course linkage + backlink list via ID enumeration.
      // Codex review finding 2026-05-17.
      const viewerId = req.user?.userId
      const sheetVisible = sheet.status === 'published' || sheet.userId === viewerId
      if (!sheetVisible) return res.json({ items: [] })

      const blocked = await getBlockedSafe(viewerId)
      const notIn = notInClause(blocked)

      const [siblings, backlinkNotes] = await Promise.all([
        prisma.studySheet.findMany({
          where: {
            courseId: sheet.courseId,
            status: 'published',
            id: { not: sheet.id },
            ...(notIn ? { userId: notIn } : {}),
          },
          select: {
            id: true,
            title: true,
            previewText: true,
            stars: true,
            author: { select: { username: true } },
          },
          orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
          take: MAX_ITEMS_PER_BUCKET,
        }),
        prisma.note.findMany({
          where: {
            relatedSheetId: sheetId,
            private: false,
            ...(notIn ? { userId: notIn } : {}),
          },
          select: {
            id: true,
            title: true,
            author: { select: { username: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ITEMS_PER_BUCKET,
        }),
      ])

      const items = []
      for (const s of siblings) {
        items.push({
          type: 'sheet',
          id: s.id,
          title: s.title,
          subtitle: `${s.stars || 0}★ · by ${s.author?.username || 'unknown'}`,
          href: `/sheets/${s.id}`,
        })
      }
      for (const n of backlinkNotes) {
        items.push({
          type: 'note',
          id: n.id,
          title: n.title || 'Untitled note',
          subtitle: `Note by ${n.author?.username || 'unknown'}`,
          href: `/notes/${n.id}`,
        })
      }

      return res.json({ items: items.slice(0, MAX_TOTAL_ITEMS) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── GET /api/related/note/:id ────────────────────────────────────────
// For a note: pull the linked sheet (if any) + other notes by the
// same author about the same course.
router.get(
  '/note/:id',
  // No cacheControl: the response depends on the viewer's block list
  // (via getBlockedUserIds). Browser cache could serve blocked-user
  // rows to someone who blocks them on shared-browser machines.
  // Loop 2 security finding 2026-05-16.
  optionalAuth,
  async (req, res) => {
    const noteId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(noteId) || noteId < 1) {
      return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
    }
    try {
      const note = await prisma.note.findUnique({
        where: { id: noteId },
        select: {
          id: true,
          userId: true,
          courseId: true,
          relatedSheetId: true,
          relatedPaperId: true,
          private: true,
        },
      })
      if (!note) return res.json({ items: [] })

      // Visibility gate: private notes only expose related work to their
      // owner. Without this, an enumerator could probe note IDs and learn
      // linked-sheet + same-course/same-author public-note metadata that
      // hints at the private note's contents.
      // Codex review finding 2026-05-17.
      const viewerId = req.user?.userId
      const noteVisible = !note.private || note.userId === viewerId
      if (!noteVisible) return res.json({ items: [] })

      const blocked = await getBlockedSafe(viewerId)
      const items = []

      if (note.relatedSheetId) {
        const sheet = await prisma.studySheet.findUnique({
          where: { id: note.relatedSheetId },
          select: {
            id: true,
            title: true,
            userId: true,
            status: true,
            author: { select: { username: true } },
          },
        })
        // Block-filter against the SHEET's author id, not the sheet id.
        // `blocked` is a list of userIds — an earlier draft confused
        // the two (Loop 1 finding 2026-05-16). Also gate by sheet status
        // so a private note's link to a draft sheet doesn't leak draft
        // metadata (Codex finding 2026-05-17).
        const sheetVisible = sheet && (sheet.status === 'published' || sheet.userId === viewerId)
        if (sheetVisible && !blocked.includes(sheet.userId)) {
          items.push({
            type: 'sheet',
            id: sheet.id,
            title: sheet.title,
            subtitle: `Linked sheet by ${sheet.author?.username || 'unknown'}`,
            href: `/sheets/${sheet.id}`,
          })
        }
      }

      // Sibling notes by the same author about the same course
      if (note.courseId) {
        const siblings = await prisma.note.findMany({
          where: {
            userId: note.userId,
            courseId: note.courseId,
            id: { not: noteId },
            private: false,
          },
          select: { id: true, title: true },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ITEMS_PER_BUCKET,
        })
        for (const s of siblings) {
          items.push({
            type: 'note',
            id: s.id,
            title: s.title || 'Untitled note',
            subtitle: 'Same course, same author',
            href: `/notes/${s.id}`,
          })
        }
      }

      return res.json({ items: items.slice(0, MAX_TOTAL_ITEMS) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── GET /api/related/paper/:paperId ──────────────────────────────────
// For a Scholar paper: pull sheets that were derived FROM this paper
// + notes that reference it.
router.get(
  '/paper/:paperId',
  // No cacheControl: the response depends on the viewer's block list
  // (via getBlockedUserIds). Browser cache could serve blocked-user
  // rows to someone who blocks them on shared-browser machines.
  // Loop 2 security finding 2026-05-16.
  optionalAuth,
  async (req, res) => {
    const paperId = String(req.params.paperId || '').slice(0, 128)
    if (!paperId || !OPAQUE_ID_REGEX.test(paperId)) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    try {
      const blocked = await getBlockedSafe(req.user?.userId)
      const notIn = notInClause(blocked)

      const [sheets, notes] = await Promise.all([
        prisma.studySheet.findMany({
          where: {
            derivedFromPaperId: paperId,
            status: 'published',
            ...(notIn ? { userId: notIn } : {}),
          },
          select: {
            id: true,
            title: true,
            author: { select: { username: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: MAX_ITEMS_PER_BUCKET,
        }),
        prisma.note.findMany({
          where: {
            relatedPaperId: paperId,
            private: false,
            ...(notIn ? { userId: notIn } : {}),
          },
          select: {
            id: true,
            title: true,
            author: { select: { username: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ITEMS_PER_BUCKET,
        }),
      ])

      const items = []
      for (const s of sheets) {
        items.push({
          type: 'sheet',
          id: s.id,
          title: s.title,
          subtitle: `Generated from this paper · by ${s.author?.username || 'unknown'}`,
          href: `/sheets/${s.id}`,
        })
      }
      for (const n of notes) {
        items.push({
          type: 'note',
          id: n.id,
          title: n.title || 'Untitled note',
          subtitle: `Note by ${n.author?.username || 'unknown'}`,
          href: `/notes/${n.id}`,
        })
      }
      return res.json({ items: items.slice(0, MAX_TOTAL_ITEMS) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── GET /api/related/book/:volumeId ──────────────────────────────────
// For a Library book (Google Books volumeId): pull sheets that link to
// this book via libraryVolumeId.
router.get(
  '/book/:volumeId',
  // No cacheControl: the response depends on the viewer's block list
  // (via getBlockedUserIds). Browser cache could serve blocked-user
  // rows to someone who blocks them on shared-browser machines.
  // Loop 2 security finding 2026-05-16.
  optionalAuth,
  async (req, res) => {
    const volumeId = String(req.params.volumeId || '').slice(0, 64)
    if (!volumeId || !OPAQUE_ID_REGEX.test(volumeId)) {
      return sendError(res, 400, 'Invalid volume id.', ERROR_CODES.BAD_REQUEST)
    }
    try {
      const blocked = await getBlockedSafe(req.user?.userId)
      const notIn = notInClause(blocked)

      const sheets = await prisma.studySheet.findMany({
        where: {
          libraryVolumeId: volumeId,
          status: 'published',
          ...(notIn ? { userId: notIn } : {}),
        },
        select: {
          id: true,
          title: true,
          author: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_TOTAL_ITEMS,
      })

      const items = sheets.map((s) => ({
        type: 'sheet',
        id: s.id,
        title: s.title,
        subtitle: `Sheet about this book · by ${s.author?.username || 'unknown'}`,
        href: `/sheets/${s.id}`,
      }))
      return res.json({ items })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
