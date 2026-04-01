/* ═══════════════════════════════════════════════════════════════════════════
 * plagiarismService.js — Plagiarism detection for StudyHub content
 *
 * Provides:
 *   - updateFingerprint(): fire-and-forget fingerprint update after content change
 *   - findSimilarContent(): find likely originals for a reported piece of content
 *
 * Similarity thresholds:
 *   - exactHash match = exact copy (different authors)
 *   - simhash similarity ≥ 0.85 = likely copy
 *   - simhash similarity ≥ 0.70 = suspicious
 *
 * Used by:
 *   - Sheet/note creation and update (fire-and-forget fingerprint)
 *   - Admin plagiarism report review (find matches)
 * ═══════════════════════════════════════════════════════════════════════════ */
const { captureError } = require('../monitoring/sentry')
const prisma = require('./prisma')
const { fingerprint, similarity } = require('./contentFingerprint')

const SIMILARITY_THRESHOLD = 0.70
const LIKELY_COPY_THRESHOLD = 0.85

/**
 * Fire-and-forget: compute and store fingerprints for a content record.
 *
 * @param {'sheet'|'note'} contentType
 * @param {number} contentId
 * @param {string} text — the content text to fingerprint
 */
async function updateFingerprint(contentType, contentId, text) {
  try {
    if (!text || text.trim().length < 20) return

    const fp = fingerprint(text)
    if (!fp.exactHash || !fp.simhash) return

    if (contentType === 'sheet') {
      await prisma.studySheet.update({
        where: { id: contentId },
        data: { contentHash: fp.exactHash, contentSimhash: fp.simhash },
      })
    } else if (contentType === 'note') {
      await prisma.note.update({
        where: { id: contentId },
        data: { contentHash: fp.exactHash, contentSimhash: fp.simhash },
      })
    }
  } catch (err) {
    captureError(err, { context: 'fingerprint-update', contentType, contentId })
  }
}

/**
 * Find content similar to a given piece of text or content record.
 * Returns an array of matches sorted by similarity score (descending).
 *
 * @param {object} params
 * @param {'sheet'|'note'} params.contentType — type of the reported content
 * @param {number} params.contentId — ID of the reported content
 * @param {number} [params.limit=10] — max results
 * @returns {Promise<Array<{ type, id, title, authorId, authorUsername, similarity, isExactMatch, createdAt }>>}
 */
async function findSimilarContent({ contentType, contentId, limit = 10 }) {
  try {
    /* Fetch the reported content's fingerprint and text */
    let reported = null
    if (contentType === 'sheet') {
      reported = await prisma.studySheet.findUnique({
        where: { id: contentId },
        select: { id: true, userId: true, content: true, contentHash: true, contentSimhash: true, createdAt: true },
      })
    } else if (contentType === 'note') {
      reported = await prisma.note.findUnique({
        where: { id: contentId },
        select: { id: true, userId: true, content: true, contentHash: true, contentSimhash: true, createdAt: true },
      })
    }

    if (!reported || !reported.content) return []

    /* Ensure fingerprint is computed */
    let reportedHash = reported.contentHash
    let reportedSimhash = reported.contentSimhash
    if (!reportedHash || !reportedSimhash) {
      const fp = fingerprint(reported.content)
      reportedHash = fp.exactHash
      reportedSimhash = fp.simhash
      // Update in background
      void updateFingerprint(contentType, contentId, reported.content)
    }
    if (!reportedHash || !reportedSimhash) return []

    const matches = []

    /* Phase 1: Exact hash matches across sheets and notes */
    const [exactSheets, exactNotes] = await Promise.all([
      prisma.studySheet.findMany({
        where: {
          contentHash: reportedHash,
          NOT: contentType === 'sheet' ? { id: contentId } : undefined,
        },
        select: {
          id: true, title: true, userId: true, createdAt: true, contentSimhash: true,
          author: { select: { id: true, username: true } },
        },
        take: 20,
      }),
      prisma.note.findMany({
        where: {
          contentHash: reportedHash,
          private: false,
          NOT: contentType === 'note' ? { id: contentId } : undefined,
        },
        select: {
          id: true, title: true, userId: true, createdAt: true, contentSimhash: true,
          author: { select: { id: true, username: true } },
        },
        take: 20,
      }),
    ])

    for (const s of exactSheets) {
      if (s.userId === reported.userId && contentType === 'sheet') continue // skip own content
      matches.push({
        type: 'sheet',
        id: s.id,
        title: s.title,
        authorId: s.author?.id || s.userId,
        authorUsername: s.author?.username || 'Unknown',
        similarity: 1.0,
        isExactMatch: true,
        createdAt: s.createdAt,
      })
    }
    for (const n of exactNotes) {
      if (n.userId === reported.userId && contentType === 'note') continue
      matches.push({
        type: 'note',
        id: n.id,
        title: n.title,
        authorId: n.author?.id || n.userId,
        authorUsername: n.author?.username || 'Unknown',
        similarity: 1.0,
        isExactMatch: true,
        createdAt: n.createdAt,
      })
    }

    /* Phase 2: SimHash similarity scan (brute-force over fingerprinted content) */
    const [simSheets, simNotes] = await Promise.all([
      prisma.studySheet.findMany({
        where: {
          AND: [
            ...(contentType === 'sheet' ? [{ NOT: { id: contentId } }] : []),
            { status: 'published' },
            { NOT: [{ contentSimhash: null }] },
          ],
        },
        select: {
          id: true, title: true, userId: true, createdAt: true, contentSimhash: true, contentHash: true,
          author: { select: { id: true, username: true } },
        },
        take: 500, // scan up to 500 sheets
        orderBy: { createdAt: 'desc' },
      }),
      prisma.note.findMany({
        where: {
          AND: [
            ...(contentType === 'note' ? [{ NOT: { id: contentId } }] : []),
            { private: false },
            { NOT: [{ contentSimhash: null }] },
          ],
        },
        select: {
          id: true, title: true, userId: true, createdAt: true, contentSimhash: true, contentHash: true,
          author: { select: { id: true, username: true } },
        },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const alreadyMatched = new Set(matches.map((m) => `${m.type}-${m.id}`))

    for (const s of simSheets) {
      if (alreadyMatched.has(`sheet-${s.id}`)) continue
      if (s.userId === reported.userId && contentType === 'sheet') continue
      const sim = similarity(reportedSimhash, s.contentSimhash)
      if (sim >= SIMILARITY_THRESHOLD) {
        matches.push({
          type: 'sheet',
          id: s.id,
          title: s.title,
          authorId: s.author?.id || s.userId,
          authorUsername: s.author?.username || 'Unknown',
          similarity: Math.round(sim * 1000) / 1000,
          isExactMatch: s.contentHash === reportedHash,
          createdAt: s.createdAt,
        })
      }
    }

    for (const n of simNotes) {
      if (alreadyMatched.has(`note-${n.id}`)) continue
      if (n.userId === reported.userId && contentType === 'note') continue
      const sim = similarity(reportedSimhash, n.contentSimhash)
      if (sim >= SIMILARITY_THRESHOLD) {
        matches.push({
          type: 'note',
          id: n.id,
          title: n.title,
          authorId: n.author?.id || n.userId,
          authorUsername: n.author?.username || 'Unknown',
          similarity: Math.round(sim * 1000) / 1000,
          isExactMatch: n.contentHash === reportedHash,
          createdAt: n.createdAt,
        })
      }
    }

    /* Sort by similarity desc, then by createdAt asc (older = likely original) */
    matches.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity
      return new Date(a.createdAt) - new Date(b.createdAt)
    })

    return matches.slice(0, limit)
  } catch (err) {
    captureError(err, { context: 'plagiarism-find-similar', contentType, contentId })
    return []
  }
}

module.exports = {
  updateFingerprint,
  findSimilarContent,
  SIMILARITY_THRESHOLD,
  LIKELY_COPY_THRESHOLD,
}
