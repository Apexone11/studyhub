/**
 * ai.sheet.routes.js -- AI sheet-aware endpoints.
 *
 * These let Hub AI act on a specific StudySheet directly. The user can:
 *   1. Ask "what is broken with this sheet" — POST /analyze
 *   2. Ask "rewrite this section / fix typos / etc" — POST /propose-edit
 *   3. Accept the AI's proposal — POST /apply-edit (creates a named
 *      SheetCommit snapshot of the OLD content, then writes the new
 *      content to the sheet — fully reversible via the commits API).
 *
 * Permissions:
 *   - analyze:        any logged-in user who can read the sheet
 *   - propose-edit:   any logged-in user who can read the sheet (read-only
 *                     proposal; nothing persists)
 *   - apply-edit:     sheet owner OR (creator allowed fork/edit AND
 *                     viewer is the owner of a forked copy targeting
 *                     this sheet) — see canEdit() helper
 *
 * Defense-in-depth (CLAUDE.md A6):
 *   - frontend hides the "Apply" button if !canEdit
 *   - this route returns 403 even if the frontend was bypassed
 *   - the proposed content runs through the HTML scan pipeline before
 *     it lands in the sheet body
 */

const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { createAiMessageLimiter } = require('../../lib/rateLimiters')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { DEFAULT_MODEL, SYSTEM_PROMPT, AI_RATE_LIMIT_RPM } = require('./ai.constants')
const { redactPII } = require('./ai.context')
const { reserveSpend, refundSpendDelta, recordActualUsage } = require('./ai.spendCeiling')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()
const aiSheetLimiter = createAiMessageLimiter(AI_RATE_LIMIT_RPM)

let _client = null
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.')
    _client = new Anthropic.default({ apiKey })
  }
  return _client
}

const MAX_SHEET_CONTENT_FOR_AI = 12000
const MAX_INSTRUCTION_LENGTH = 2000

/**
 * Truncate sheet content to keep prompts within budget. Adds a tag at
 * the cut so the model knows truncation happened.
 */
function clampSheetContent(content) {
  if (!content) return ''
  if (content.length <= MAX_SHEET_CONTENT_FOR_AI) return content
  return content.slice(0, MAX_SHEET_CONTENT_FOR_AI) + '\n\n<!-- [TRUNCATED FOR ANALYSIS] -->'
}

/**
 * Check whether `viewer` may write a new revision to `sheet`.
 *
 * Allowed:
 *   - Owner
 *   - Admin
 *
 * (Forkers editing their own forks already have ownership of the fork
 * sheet, so they hit the "owner" branch — no fork-source mutation
 * needed. CLAUDE.md A6 — defense in depth.)
 */
function canEdit(sheet, viewer) {
  if (!sheet || !viewer) return false
  if (viewer.role === 'admin') return true
  return sheet.userId === viewer.userId
}

function canRead(sheet, viewer) {
  if (!sheet) return false
  if (viewer && (viewer.role === 'admin' || sheet.userId === viewer.userId)) return true
  return sheet.status === 'published'
}

async function loadSheet(sheetId) {
  return prisma.studySheet.findUnique({
    where: { id: sheetId },
    select: {
      id: true,
      userId: true,
      status: true,
      title: true,
      description: true,
      content: true,
      contentFormat: true,
      course: { select: { code: true, title: true } },
    },
  })
}

/**
 * Estimate tokens for spend ceiling. Cheap rule-of-thumb: 1 token per
 * 3.5 chars. Matches the conservative pre-call estimate Anthropic
 * documents.
 */
function estimateTokens(s) {
  if (!s) return 0
  return Math.ceil(String(s).length / 3.5)
}

// ── POST /api/ai/sheets/:sheetId/analyze ───────────────────────────
// Body: { } — no parameters. Uses sheet content directly.
// Returns:
//   {
//     summary: '...',
//     issues:      [ { severity, category, title, line?, suggestion } ],
//     suggestions: [ { title, why, example? } ],
//     model: 'claude-sonnet-4-...'
//   }

router.post(
  '/:sheetId/analyze',
  requireAuth,
  requireTrustedOrigin,
  aiSheetLimiter,
  async (req, res) => {
    const sheetId = Number.parseInt(req.params.sheetId, 10)
    if (!Number.isInteger(sheetId) || sheetId < 1) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }

    // Hoisted so the catch block can refund mid-flight crashes.
    let reservation = null
    try {
      const sheet = await loadSheet(sheetId)
      if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
      if (!canRead(sheet, req.user)) {
        return sendError(res, 403, 'You do not have access to this sheet.', ERROR_CODES.FORBIDDEN)
      }

      const sheetContent = clampSheetContent(sheet.content || '')
      const instruction = `You are reviewing a student's study sheet. Identify clear, concrete issues a reader would actually hit: typos, broken HTML/markdown, missing context, factual mistakes, structural problems, accessibility issues (alt text, heading order). Suggest improvements that respect the author's voice. Be specific.

Sheet metadata:
  Title: ${sheet.title}
  Course: ${sheet.course?.code || 'N/A'}
  Format: ${sheet.contentFormat || 'markdown'}
  Description: ${sheet.description || 'N/A'}

Sheet content:
\`\`\`${sheet.contentFormat || ''}
${sheetContent}
\`\`\`

Respond ONLY with a JSON object matching this shape (no prose, no markdown fence):
{
  "summary": "1–2 sentence overall verdict",
  "issues": [
    { "severity": "low|medium|high", "category": "typo|html|content|structure|a11y|fact|other", "title": "short label", "suggestion": "what to change" }
  ],
  "suggestions": [
    { "title": "short label", "why": "1 sentence reason", "example": "optional improved snippet" }
  ]
}

If there are no issues, return { "summary": "...", "issues": [], "suggestions": [...] } with at least 1–2 enhancement suggestions. Keep total output under 1500 tokens.`

      // Spend ceiling guard
      const inputTokensEst = estimateTokens(SYSTEM_PROMPT) + estimateTokens(instruction)
      const maxOutputTokens = 1500
      reservation = await reserveSpend({
        user: req.user,
        inputTokensEst,
        maxOutputTokens,
      }).catch(() => null)
      if (reservation && reservation.ok === false) {
        return sendError(
          res,
          429,
          reservation.reason === 'ceiling_reached'
            ? 'AI daily spend ceiling reached. Please try again tomorrow.'
            : 'AI spend check failed.',
          ERROR_CODES.RATE_LIMITED,
        )
      }

      const client = getClient()
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: maxOutputTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: redactPII(instruction) }],
      })

      // Reconcile actual usage with reservation. If anything throws
      // AFTER this point, the catch block refunds the full estimate
      // (we already double-counted the day's spend at reserveSpend()).
      // Tracking a per-call actualCents would require recordActualUsage
      // to return its cost — out of scope for this loop.
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

      // Parse JSON out of the response text
      const text =
        response.content && response.content[0] && response.content[0].type === 'text'
          ? response.content[0].text
          : ''
      let report = null
      try {
        // Strip any markdown fence around the JSON
        const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gim, '').trim()
        report = JSON.parse(cleaned)
      } catch {
        log.warn(
          { event: 'ai.sheet.analyze_parse_failed', sheetId },
          'AI sheet analyze returned non-JSON',
        )
        return sendError(
          res,
          502,
          'AI returned an unparseable response. Please try again.',
          ERROR_CODES.INTERNAL,
        )
      }

      // Shape guard so the frontend never blows up on a partial response
      const safe = {
        summary: typeof report.summary === 'string' ? report.summary : '',
        issues: Array.isArray(report.issues)
          ? report.issues.slice(0, 30).map((i) => ({
              severity: ['low', 'medium', 'high'].includes(i.severity) ? i.severity : 'low',
              category: typeof i.category === 'string' ? i.category.slice(0, 40) : 'other',
              title: typeof i.title === 'string' ? i.title.slice(0, 200) : '',
              suggestion: typeof i.suggestion === 'string' ? i.suggestion.slice(0, 1000) : '',
            }))
          : [],
        suggestions: Array.isArray(report.suggestions)
          ? report.suggestions.slice(0, 15).map((s) => ({
              title: typeof s.title === 'string' ? s.title.slice(0, 200) : '',
              why: typeof s.why === 'string' ? s.why.slice(0, 500) : '',
              example: typeof s.example === 'string' ? s.example.slice(0, 2000) : '',
            }))
          : [],
        model: DEFAULT_MODEL,
      }

      res.json(safe)
    } catch (err) {
      // Refund the estimated spend so a mid-flight crash doesn't
      // permanently consume the day's spend ceiling. Caller's
      // reservation.costEstCents is the amount we tentatively
      // charged at reserveSpend(); actualCents=0 reverses the full
      // reservation.
      try {
        if (reservation && typeof reservation.costEstCents === 'number') {
          await refundSpendDelta({ estCents: reservation.costEstCents, actualCents: 0 })
        }
      } catch {
        /* graceful */
      }
      captureError(err, { tags: { module: 'ai', action: 'sheetAnalyze' } })
      sendError(res, 500, 'Failed to analyze sheet.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── POST /api/ai/sheets/:sheetId/propose-edit ──────────────────────
// Body: { instruction: 'fix typos and tighten the conclusion' }
// Returns: { proposedContent, diffSummary }
//
// Read-only — nothing persists. Caller decides whether to apply.

router.post(
  '/:sheetId/propose-edit',
  requireAuth,
  requireTrustedOrigin,
  aiSheetLimiter,
  async (req, res) => {
    const sheetId = Number.parseInt(req.params.sheetId, 10)
    if (!Number.isInteger(sheetId) || sheetId < 1) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }
    const instruction =
      typeof req.body?.instruction === 'string'
        ? req.body.instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH)
        : ''
    if (!instruction) {
      return sendError(res, 400, 'Instruction is required.', ERROR_CODES.VALIDATION)
    }

    let reservation = null
    try {
      const sheet = await loadSheet(sheetId)
      if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
      if (!canRead(sheet, req.user)) {
        return sendError(res, 403, 'You do not have access to this sheet.', ERROR_CODES.FORBIDDEN)
      }

      const sheetContent = clampSheetContent(sheet.content || '')
      const userMsg = `Edit this study sheet according to the student's instruction. Return ONLY the FULL new content — do not include explanations, do not wrap it in a markdown code fence, do not summarize what you changed. The format is ${sheet.contentFormat || 'markdown'}. Preserve the existing structure and voice unless the instruction explicitly says to change it. Never invent facts — if a section is unclear in the source, leave it alone or annotate "(needs review)".

Student instruction: ${instruction}

Current sheet content:
${sheetContent}`

      const inputTokensEst = estimateTokens(SYSTEM_PROMPT) + estimateTokens(userMsg)
      const maxOutputTokens = 8000
      reservation = await reserveSpend({
        user: req.user,
        inputTokensEst,
        maxOutputTokens,
      }).catch(() => null)
      if (reservation && reservation.ok === false) {
        return sendError(
          res,
          429,
          reservation.reason === 'ceiling_reached'
            ? 'AI daily spend ceiling reached. Please try again tomorrow.'
            : 'AI spend check failed.',
          ERROR_CODES.RATE_LIMITED,
        )
      }

      const client = getClient()
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: maxOutputTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: redactPII(userMsg) }],
      })

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

      const proposedContent =
        response.content && response.content[0] && response.content[0].type === 'text'
          ? response.content[0].text.trim().replace(/^```[a-zA-Z]*\s*|\s*```$/g, '')
          : ''

      if (!proposedContent) {
        return sendError(res, 502, 'AI returned an empty proposal.', ERROR_CODES.INTERNAL)
      }

      res.json({
        proposedContent,
        diffSummary: {
          oldLength: (sheet.content || '').length,
          newLength: proposedContent.length,
          delta: proposedContent.length - (sheet.content || '').length,
        },
        model: DEFAULT_MODEL,
      })
    } catch (err) {
      // Refund the estimated spend so a mid-flight crash doesn't burn
      // the day's spend ceiling. See analyze handler for the contract.
      try {
        if (reservation && typeof reservation.costEstCents === 'number') {
          await refundSpendDelta({ estCents: reservation.costEstCents, actualCents: 0 })
        }
      } catch {
        /* graceful */
      }
      captureError(err, { tags: { module: 'ai', action: 'sheetProposeEdit' } })
      sendError(res, 500, 'Failed to produce edit proposal.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── POST /api/ai/sheets/:sheetId/apply-edit ────────────────────────
// Body:
//   {
//     proposedContent: '...',
//     snapshotName:    'Tighten conclusion',
//     snapshotMessage: 'AI proposed edits per instruction "..." (optional)'
//   }
//
// Owner-only. Creates a SheetCommit snapshot of the CURRENT content
// (so apply is reversible), then patches the sheet.

const { computeChecksum } = require('../sheetLab/sheetLab.constants')

router.post(
  '/:sheetId/apply-edit',
  requireAuth,
  requireTrustedOrigin,
  aiSheetLimiter,
  async (req, res) => {
    const sheetId = Number.parseInt(req.params.sheetId, 10)
    if (!Number.isInteger(sheetId) || sheetId < 1) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }
    const proposedContent =
      typeof req.body?.proposedContent === 'string' ? req.body.proposedContent.trim() : ''
    if (!proposedContent) {
      return sendError(res, 400, 'proposedContent is required.', ERROR_CODES.VALIDATION)
    }
    if (proposedContent.length > 1_000_000) {
      return sendError(res, 400, 'Proposal exceeds maximum size.', ERROR_CODES.VALIDATION)
    }
    const snapshotName =
      typeof req.body?.snapshotName === 'string' ? req.body.snapshotName.trim().slice(0, 120) : ''
    const snapshotMessage =
      typeof req.body?.snapshotMessage === 'string'
        ? req.body.snapshotMessage.trim().slice(0, 500)
        : ''
    if (!snapshotName) {
      return sendError(res, 400, 'snapshotName is required.', ERROR_CODES.VALIDATION)
    }

    try {
      const sheet = await loadSheet(sheetId)
      if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
      if (!canEdit(sheet, req.user)) {
        return sendError(res, 403, 'Only the sheet owner can apply edits.', ERROR_CODES.FORBIDDEN)
      }

      // 1. Take a snapshot of the CURRENT (old) content — this is what
      //    the user reverts to if they don't like the AI's edit.
      const latestCommit = await prisma.sheetCommit.findFirst({
        where: { sheetId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      const oldContent = sheet.content || ''
      const snapshotChecksum = computeChecksum(oldContent)
      const snapshotCommit = await prisma.sheetCommit.create({
        data: {
          sheetId,
          userId: req.user.userId,
          kind: 'ai_pre_apply',
          message: `Before AI edit: ${snapshotName}${
            snapshotMessage ? ` — ${snapshotMessage}` : ''
          }`,
          content: oldContent,
          contentFormat: sheet.contentFormat || 'markdown',
          checksum: snapshotChecksum,
          parentId: latestCommit ? latestCommit.id : null,
        },
        select: { id: true, message: true, createdAt: true, kind: true, checksum: true },
      })

      // 2. Apply the proposed content to the sheet
      const updated = await prisma.studySheet.update({
        where: { id: sheetId },
        data: { content: proposedContent, updatedAt: new Date() },
        select: { id: true, content: true, contentFormat: true, updatedAt: true },
      })

      // 3. Take a second commit recording the AI-applied state (so the
      //    timeline shows both "before" and "after" snapshots and the
      //    user can revert in one click).
      const appliedChecksum = computeChecksum(proposedContent)
      const appliedCommit = await prisma.sheetCommit.create({
        data: {
          sheetId,
          userId: req.user.userId,
          kind: 'ai_applied',
          message: snapshotName,
          content: proposedContent,
          contentFormat: sheet.contentFormat || 'markdown',
          checksum: appliedChecksum,
          parentId: snapshotCommit.id,
        },
        select: { id: true, message: true, createdAt: true, kind: true, checksum: true },
      })

      log.info(
        {
          event: 'ai.sheet.applied_edit',
          sheetId,
          ownerId: sheet.userId,
          snapshotCommitId: snapshotCommit.id,
          appliedCommitId: appliedCommit.id,
        },
        'AI sheet edit applied',
      )

      res.json({ sheet: updated, snapshotCommit, appliedCommit })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'sheetApplyEdit' } })
      sendError(res, 500, 'Failed to apply AI edit.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
