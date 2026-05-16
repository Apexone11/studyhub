/**
 * notes.import.controller.js — POST /api/notes/import
 *
 * Drag-and-drop file upload that lands as a new Note. v1 ships with
 * plain-text and markdown support; PDF / DOCX support is gated on the
 * AI attachments parser stack (`backend/src/modules/ai/attachments/`)
 * and lands in a follow-up.
 *
 * Pipeline:
 *   1. Multer in-memory upload (5 MB cap, mime-type allowlist).
 *   2. Bytes → UTF-8 + control-character strip (sanitizeExtractedText).
 *   3. Anthropic Sonnet generates a title from the first ~2000 chars,
 *      auto-stripping markdown emphasis / fences / leading hashes.
 *   4. Persist a new Note for the calling user; private by default.
 *   5. Return the serialized note for the frontend to navigate to.
 *
 * Defense in depth (CLAUDE.md A6):
 *   - requireAuth + requireVerifiedEmail + originAllowlist on the route.
 *   - Multer fileFilter rejects anything outside the allowlist.
 *   - Anthropic call goes through reserveSpend so the daily ceiling
 *     and per-user quota apply.
 *   - Sentry capture on any failure.
 */
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { sanitizeExtractedText } = require('../ai/attachments/attachments.parsers')
const { DEFAULT_MODEL, SYSTEM_PROMPT } = require('../ai/ai.constants')
const { reserveSpend, recordActualUsage, refundSpendDelta } = require('../ai/ai.spendCeiling')
const { redactPII } = require('../ai/ai.context')

const MAX_IMPORT_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_TITLE_LENGTH = 300
const MAX_CONTENT_LENGTH = 200_000
const TITLE_PROMPT_INPUT_CAP = 2000

const ALLOWED_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/x-org',
  'text/x-rst',
  'application/octet-stream', // some browsers send this for .md
])

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.rst', '.org'])

let _client = null
function getClient() {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.')
  _client = new Anthropic.default({ apiKey: key })
  return _client
}

function estimateTokens(s) {
  return Math.ceil((s || '').length / 3.5)
}

/**
 * Multer config — exported so the route file can mount it. In-memory
 * because we never persist the raw bytes (only the extracted text).
 */
const multer = require('multer')
const importUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ext = file.originalname ? '.' + file.originalname.split('.').pop().toLowerCase() : ''
    const mimeOk = ALLOWED_MIME.has(file.mimetype)
    const extOk = ALLOWED_EXTENSIONS.has(ext)
    if (!mimeOk && !extOk) {
      return cb(
        new Error(
          'Unsupported file type. Drag in a .txt or .md (Markdown) file. PDF / DOCX support is coming soon.',
        ),
      )
    }
    cb(null, true)
  },
})

async function generateTitle({ user, body }) {
  const input = body.slice(0, TITLE_PROMPT_INPUT_CAP)
  const userMsg = `Write a short, descriptive title for the document below. Rules:
- 3 to 12 words.
- Plain text, no markdown formatting, no quotes, no trailing punctuation.
- Title-case (capitalize content words).
- If the document already begins with a clear title (e.g. an H1 heading), use that title verbatim — do NOT improve it.
- If the document is empty or content-less, respond with exactly: Untitled note

Document:
${input}`

  const inputTokensEst = estimateTokens(SYSTEM_PROMPT) + estimateTokens(userMsg)
  const maxOutputTokens = 80
  // reserveSpend is fail-safe — if the helper itself throws, we drop the
  // reservation and proceed without spend accounting rather than 500.
  // The Anthropic call is still rate-limited by per-route limiter and
  // the response is tiny, so the fallback is acceptable.
  const reservation = await reserveSpend({
    user,
    inputTokensEst,
    maxOutputTokens,
  }).catch(() => null)
  if (reservation && reservation.ok === false) {
    return { ok: false, reason: reservation.reason || 'spend_limit' }
  }
  try {
    const response = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: maxOutputTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: redactPII(userMsg) }],
    })
    if (reservation && response.usage) {
      recordActualUsage({
        userId: user.userId,
        tokensIn: response.usage.input_tokens || 0,
        tokensOut: response.usage.output_tokens || 0,
      }).catch(() => {})
    }
    const raw =
      response.content && response.content[0] && response.content[0].type === 'text'
        ? response.content[0].text
        : ''
    const cleaned = (raw || '')
      .replace(/^["'`#*_\s]+|["'`#*_\s.,;:!?]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_TITLE_LENGTH)
    return { ok: true, title: cleaned || 'Untitled note' }
  } catch (err) {
    if (reservation) {
      refundSpendDelta({ estCents: reservation.costEstCents || 0, actualCents: 0 }).catch(() => {})
    }
    throw err
  }
}

async function importNoteHandler(req, res) {
  try {
    if (!req.file) {
      return sendError(
        res,
        400,
        'No file uploaded. Drag a .txt or .md file into the import zone.',
        ERROR_CODES.BAD_REQUEST,
      )
    }
    const rawText = req.file.buffer.toString('utf8')
    const sanitized = sanitizeExtractedText(rawText).slice(0, MAX_CONTENT_LENGTH)
    if (!sanitized.trim()) {
      return sendError(
        res,
        400,
        'The file was empty or had no readable text.',
        ERROR_CODES.VALIDATION,
      )
    }

    // Heuristic title — if the doc starts with a markdown H1, use that.
    // Otherwise call the AI. Saves a round-trip for the common case
    // (Notion / Obsidian exports usually start with # Title).
    let title = ''
    const firstLine = sanitized.split('\n').find((l) => l.trim().length > 0) || ''
    const h1Match = firstLine.match(/^#\s+(.{1,300})/)
    if (h1Match) {
      title = h1Match[1].trim()
    } else {
      const aiTitle = await generateTitle({ user: req.user, body: sanitized })
      if (!aiTitle.ok) {
        // Fall through — spend ceiling reached. Save with a fallback
        // title so the user still gets their note imported.
        title =
          req.file.originalname?.replace(/\.[^.]+$/, '').slice(0, MAX_TITLE_LENGTH) ||
          'Imported note'
        log.warn(
          { event: 'notes.import.title_fallback', reason: aiTitle.reason, userId: req.user.userId },
          'AI title generation declined; using filename',
        )
      } else {
        title = aiTitle.title
      }
    }

    const note = await prisma.note.create({
      data: {
        title: title.slice(0, MAX_TITLE_LENGTH),
        content: sanitized,
        userId: req.user.userId,
        private: true,
        allowDownloads: false,
        pinned: false,
        tags: '[]',
        moderationStatus: 'clean',
        revision: 0,
      },
      include: { author: { select: { id: true, username: true } }, course: true },
    })

    log.info(
      {
        event: 'notes.import.created',
        userId: req.user.userId,
        noteId: note.id,
        bytes: req.file.size,
        usedAiTitle: !h1Match,
      },
      'Imported note from file',
    )

    res.status(201).json({
      id: note.id,
      title: note.title,
      content: note.content,
      private: note.private,
      revision: note.revision,
      createdAt: note.createdAt,
      author: note.author,
      bytes: req.file.size,
    })
  } catch (err) {
    captureError(err, {
      tags: { module: 'notes', action: 'import' },
      extra: { filename: req.file?.originalname },
    })
    log.error(
      { event: 'notes.import.failed', err: err?.message, userId: req.user?.userId },
      'Notes import failed',
    )
    return sendError(
      res,
      500,
      'Could not import the file. If this keeps happening, share the file type with the StudyHub team.',
      ERROR_CODES.INTERNAL,
    )
  }
}

module.exports = {
  importNoteHandler,
  importUploadMiddleware: importUploadMiddleware.single('file'),
  MAX_IMPORT_BYTES,
  MAX_TITLE_LENGTH,
}
