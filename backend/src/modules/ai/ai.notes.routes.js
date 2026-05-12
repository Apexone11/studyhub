/**
 * ai.notes.routes.js -- AI note-aware endpoints.
 *
 * Mounted at /api/ai/notes by ai/index.js.
 *
 * Endpoints:
 *   POST /api/ai/notes/:noteId/summarize  — short summary of the note
 *   POST /api/ai/notes/:noteId/flashcards — extract Q/A flashcards (JSON)
 *   POST /api/ai/notes/:noteId/ask        — answer a question about the note
 *
 * Permissions: any logged-in user who can read the note (owner OR
 * `private = false`). Writes nothing — the user explicitly saves the
 * result back to notes via the existing /api/ai/save-to-notes route
 * if they want it persisted.
 */

const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { createAiMessageLimiter } = require('../../lib/rateLimiters')
const prisma = require('../../lib/prisma')
const { DEFAULT_MODEL, SYSTEM_PROMPT, AI_RATE_LIMIT_RPM } = require('./ai.constants')
const { redactPII } = require('./ai.context')
const { reserveSpend, refundSpendDelta, recordActualUsage } = require('./ai.spendCeiling')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()
const aiNoteLimiter = createAiMessageLimiter(AI_RATE_LIMIT_RPM)

let _client = null
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.')
    _client = new Anthropic.default({ apiKey })
  }
  return _client
}

const MAX_NOTE_CONTENT = 12000
const MAX_QUESTION_LENGTH = 1500

function clamp(content, max) {
  if (!content) return ''
  return content.length <= max ? content : content.slice(0, max) + '\n\n[...truncated]'
}

function canRead(note, viewer) {
  if (!note) return false
  if (viewer && (viewer.role === 'admin' || note.userId === viewer.userId)) return true
  return note.private === false
}

async function loadNote(noteId) {
  return prisma.note.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      userId: true,
      private: true,
      title: true,
      content: true,
      course: { select: { code: true } },
    },
  })
}

function estimateTokens(s) {
  return s ? Math.ceil(String(s).length / 3.5) : 0
}

async function runAi({ req, res, userMsg, maxOutputTokens, parseAsJson = false }) {
  const inputTokensEst = estimateTokens(SYSTEM_PROMPT) + estimateTokens(userMsg)
  const reservation = await reserveSpend({
    user: req.user,
    inputTokensEst,
    maxOutputTokens,
  }).catch(() => null)
  if (reservation && reservation.ok === false) {
    sendError(
      res,
      429,
      reservation.reason === 'ceiling_reached'
        ? 'AI daily spend ceiling reached. Please try again tomorrow.'
        : 'AI spend check failed.',
      ERROR_CODES.RATE_LIMITED,
    )
    return null
  }

  const client = getClient()
  let response
  try {
    response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: maxOutputTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: redactPII(userMsg) }],
    })
  } catch (err) {
    // Anthropic call failed mid-flight — refund the reservation so a
    // crash doesn't permanently consume the day's spend ceiling.
    if (reservation && typeof reservation.costEstCents === 'number') {
      try {
        await refundSpendDelta({ estCents: reservation.costEstCents, actualCents: 0 })
      } catch {
        /* graceful */
      }
    }
    throw err
  }

  if (reservation && response.usage) {
    try {
      await recordActualUsage({
        userId: req.user.userId,
        tokensIn: response.usage.input_tokens || 0,
        tokensOut: response.usage.output_tokens || 0,
      })
    } catch {
      /* graceful */
    }
  }

  const text =
    response.content && response.content[0] && response.content[0].type === 'text'
      ? response.content[0].text
      : ''
  if (!parseAsJson) return { text }

  try {
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gim, '').trim()
    return { json: JSON.parse(cleaned), text }
  } catch {
    return { text, json: null }
  }
}

// ── POST /api/ai/notes/:noteId/summarize ───────────────────────────
// Body: { length?: 'short' | 'medium' | 'long' }

router.post(
  '/:noteId/summarize',
  requireAuth,
  requireTrustedOrigin,
  aiNoteLimiter,
  async (req, res) => {
    const noteId = Number.parseInt(req.params.noteId, 10)
    if (!Number.isInteger(noteId) || noteId < 1) {
      return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
    }
    const length = ['short', 'medium', 'long'].includes(req.body?.length)
      ? req.body.length
      : 'medium'
    try {
      const note = await loadNote(noteId)
      if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
      if (!canRead(note, req.user)) {
        return sendError(res, 403, 'You do not have access to this note.', ERROR_CODES.FORBIDDEN)
      }

      const targetLen =
        length === 'short' ? '3 sentences' : length === 'long' ? '3 paragraphs' : '1 paragraph'
      const userMsg = `Summarize this study note in ${targetLen}. Lead with the key takeaway, then the supporting points. Do not invent facts.

Title: ${note.title}
Course: ${note.course?.code || 'N/A'}

Content:
${clamp(note.content || '', MAX_NOTE_CONTENT)}`

      const ai = await runAi({ req, res, userMsg, maxOutputTokens: 1000 })
      if (!ai) return
      res.json({ summary: ai.text.trim(), model: DEFAULT_MODEL })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'noteSummarize' } })
      sendError(res, 500, 'Failed to summarize note.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── POST /api/ai/notes/:noteId/flashcards ──────────────────────────
// Body: { count?: number (default 10, max 30) }

router.post(
  '/:noteId/flashcards',
  requireAuth,
  requireTrustedOrigin,
  aiNoteLimiter,
  async (req, res) => {
    const noteId = Number.parseInt(req.params.noteId, 10)
    if (!Number.isInteger(noteId) || noteId < 1) {
      return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
    }
    const rawCount = Number.parseInt(req.body?.count, 10) || 10
    const count = Math.min(Math.max(rawCount, 3), 30)

    try {
      const note = await loadNote(noteId)
      if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
      if (!canRead(note, req.user)) {
        return sendError(res, 403, 'You do not have access to this note.', ERROR_CODES.FORBIDDEN)
      }

      const userMsg = `Extract up to ${count} flashcards from this study note. Each flashcard tests one specific concept from the source material — do not invent facts that aren't in the note. Keep questions concrete and answers concise (1–3 sentences).

Return ONLY a JSON array (no prose, no fence):
[{ "question": "...", "answer": "...", "category": "optional short label" }]

Note title: ${note.title}
Course: ${note.course?.code || 'N/A'}

Source:
${clamp(note.content || '', MAX_NOTE_CONTENT)}`

      const ai = await runAi({ req, res, userMsg, maxOutputTokens: 4000, parseAsJson: true })
      if (!ai) return

      if (!Array.isArray(ai.json)) {
        return sendError(res, 502, 'AI returned an unparseable response.', ERROR_CODES.INTERNAL)
      }
      const cards = ai.json.slice(0, count).map((c) => ({
        question: typeof c.question === 'string' ? c.question.slice(0, 500) : '',
        answer: typeof c.answer === 'string' ? c.answer.slice(0, 1500) : '',
        category: typeof c.category === 'string' ? c.category.slice(0, 60) : '',
      }))
      res.json({ cards, model: DEFAULT_MODEL })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'noteFlashcards' } })
      sendError(res, 500, 'Failed to generate flashcards.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── POST /api/ai/notes/:noteId/ask ─────────────────────────────────
// Body: { question: 'string' }

router.post('/:noteId/ask', requireAuth, requireTrustedOrigin, aiNoteLimiter, async (req, res) => {
  const noteId = Number.parseInt(req.params.noteId, 10)
  if (!Number.isInteger(noteId) || noteId < 1) {
    return sendError(res, 400, 'Invalid note id.', ERROR_CODES.BAD_REQUEST)
  }
  const question =
    typeof req.body?.question === 'string'
      ? req.body.question.trim().slice(0, MAX_QUESTION_LENGTH)
      : ''
  if (!question) {
    return sendError(res, 400, 'Question is required.', ERROR_CODES.VALIDATION)
  }

  try {
    const note = await loadNote(noteId)
    if (!note) return sendError(res, 404, 'Note not found.', ERROR_CODES.NOT_FOUND)
    if (!canRead(note, req.user)) {
      return sendError(res, 403, 'You do not have access to this note.', ERROR_CODES.FORBIDDEN)
    }

    const userMsg = `Answer the student's question using ONLY the note below as the primary source. If the note doesn't cover the question, say so plainly — do not guess. Cite the relevant lines briefly when you can.

Question: ${question}

Note title: ${note.title}
Course: ${note.course?.code || 'N/A'}

Source:
${clamp(note.content || '', MAX_NOTE_CONTENT)}`

    const ai = await runAi({ req, res, userMsg, maxOutputTokens: 2000 })
    if (!ai) return
    res.json({ answer: ai.text.trim(), model: DEFAULT_MODEL })
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'noteAsk' } })
    sendError(res, 500, 'Failed to answer.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
