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
const {
  validateHtmlForSubmission,
  scanHtmlContentForPersistence,
} = require('../../lib/html/htmlDraftValidation')
const { RISK_TIER } = require('../../lib/html/htmlSecurity')
const { SHEET_STATUS } = require('../sheets/sheets.constants')
const { MAX_INSTRUCTION_LENGTH } = require('../../lib/zodSchemas')

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

      // Parse JSON out of the response text.
      //
      // The model occasionally adds a preamble ("Here's the analysis:")
      // before the JSON, even with explicit "Respond ONLY with JSON"
      // instructions. Find the first `{` and the matching last `}`
      // before parsing instead of trusting the model to obey perfectly.
      // Falls back to a synthesized report so the user always sees
      // SOMETHING useful instead of an opaque 500.
      const text =
        response.content && response.content[0] && response.content[0].type === 'text'
          ? response.content[0].text
          : ''
      let report = null
      try {
        const fenceStripped = text.replace(/^```(?:json)?\s*|\s*```$/gim, '').trim()
        // Find the JSON object by bracket-matching from the first `{`.
        const firstBrace = fenceStripped.indexOf('{')
        const lastBrace = fenceStripped.lastIndexOf('}')
        const jsonSlice =
          firstBrace >= 0 && lastBrace > firstBrace
            ? fenceStripped.slice(firstBrace, lastBrace + 1)
            : fenceStripped
        report = JSON.parse(jsonSlice)
      } catch (parseErr) {
        log.warn(
          {
            event: 'ai.sheet.analyze_parse_failed',
            sheetId,
            err: parseErr?.message || String(parseErr),
            textPreview: text.slice(0, 200),
          },
          'AI sheet analyze returned non-JSON — falling back to prose summary',
        )
        // Graceful fallback: surface whatever the AI did say as the
        // summary so the user gets a useful response instead of an
        // opaque 500. Suggestions list is empty in this branch.
        const fallbackSummary =
          text.trim().slice(0, 600) ||
          'AI did not return a structured response. Try asking the assistant directly in the chat below.'
        return res.json({
          summary: fallbackSummary,
          issues: [],
          suggestions: [],
          model: DEFAULT_MODEL,
          fallback: true,
        })
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

      // Categorize the error. Anthropic SDK errors carry a `.status`
      // and `.type` we trust; plain `Error` thrown from getClient when
      // ANTHROPIC_API_KEY is missing carries a recognisable message;
      // node fetch network errors carry a `.code` like ECONNRESET /
      // ENOTFOUND / ECONNREFUSED / ETIMEDOUT, or a `.cause.code`. We
      // surface those as 503 rather than 500 so the user sees a
      // useful retry message. Founder feedback 2026-05-13: every
      // analyze attempt was returning the generic "Failed to analyze
      // sheet" toast and we couldn't tell why.
      const errMsg = err?.message || String(err)
      const errStatus = Number.isInteger(err?.status) ? err.status : null
      const errType = typeof err?.type === 'string' ? err.type : null
      const errCode = err?.code || err?.cause?.code || null
      const isMissingApiKey = /ANTHROPIC_API_KEY is not set/i.test(errMsg)
      const isAnthropicAuth = errStatus === 401 || errStatus === 403
      const isAnthropicRate = errStatus === 429
      const isAnthropicServer = errStatus && errStatus >= 500 && errStatus < 600
      const isAnthropicOverloaded = errType === 'overloaded_error' || errStatus === 529
      const isNetworkFailure =
        errCode === 'ECONNRESET' ||
        errCode === 'ENOTFOUND' ||
        errCode === 'ECONNREFUSED' ||
        errCode === 'ETIMEDOUT' ||
        errCode === 'EAI_AGAIN' ||
        err?.name === 'AbortError' ||
        /fetch failed/i.test(errMsg)

      // Structured log + Sentry capture with enough context to triage
      // the next 500 in production. err.stack is critical when the
      // failure point isn't obvious from the message alone.
      log.error(
        {
          event: 'ai.sheet.analyze_failed',
          sheetId,
          userId: req.user?.userId,
          err: errMsg,
          status: errStatus,
          type: errType,
          code: errCode,
          stack: err?.stack ? String(err.stack).slice(0, 2000) : null,
          // Best-effort cause classifier so we can grep alerts by class.
          cause: isMissingApiKey
            ? 'missing_api_key'
            : isAnthropicAuth
              ? 'anthropic_auth'
              : isAnthropicRate
                ? 'anthropic_rate'
                : isAnthropicOverloaded
                  ? 'anthropic_overloaded'
                  : isAnthropicServer
                    ? 'anthropic_server'
                    : isNetworkFailure
                      ? 'network_failure'
                      : 'unknown',
        },
        'AI sheet analyze threw',
      )
      captureError(err, {
        tags: {
          module: 'ai',
          action: 'sheetAnalyze',
          anthropicStatus: errStatus ? String(errStatus) : 'none',
        },
      })

      // Pick a safe HTTP status + actionable message for the frontend.
      // The toast shows the message verbatim, so it must be human
      // readable and avoid leaking Anthropic internals.
      if (isMissingApiKey) {
        return sendError(
          res,
          503,
          'AI is not configured in this environment. Reach out to the StudyHub team if you see this in production.',
          ERROR_CODES.INTERNAL,
        )
      }
      if (isAnthropicAuth) {
        return sendError(
          res,
          503,
          'AI service is unavailable right now. Please try again later.',
          ERROR_CODES.INTERNAL,
        )
      }
      if (isAnthropicRate) {
        return sendError(
          res,
          429,
          'AI is rate-limited right now. Please wait a moment and try again.',
          ERROR_CODES.RATE_LIMITED,
        )
      }
      if (isAnthropicOverloaded || isAnthropicServer) {
        return sendError(
          res,
          503,
          'AI service is overloaded right now. Please try again in a minute.',
          ERROR_CODES.INTERNAL,
        )
      }
      if (isNetworkFailure) {
        return sendError(
          res,
          503,
          'Could not reach the AI service. Check your connection and try again.',
          ERROR_CODES.INTERNAL,
        )
      }
      // Unknown error class — keep the 500 but give the user a hint
      // that this is unexpected (so they know retry is worth trying).
      return sendError(
        res,
        500,
        'Failed to analyze sheet. Please try again. If this keeps happening, share the sheet URL with the StudyHub team.',
        ERROR_CODES.INTERNAL,
      )
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

      // ── HTML scan pipeline (Codex P1 fix) ──────────────────────────
      // If the sheet is HTML format, the AI-proposed content MUST go
      // through the same validation + risk-tier classifier that the
      // regular sheets.update.controller uses. Without this, the AI
      // could persist unsafe content (script tags, event handlers,
      // miner signatures) directly, bypassing the Tier 0-3 quarantine
      // pipeline that every other write path honors. CLAUDE.md §"HTML
      // Security Policy" + A6 (defense in depth).
      let htmlScanFields = null
      let nextStatus = sheet.status
      const contentFormat = sheet.contentFormat || 'markdown'
      if (contentFormat === 'html' && proposedContent.trim()) {
        const validation = validateHtmlForSubmission(proposedContent)
        if (!validation.ok) {
          return sendError(
            res,
            400,
            validation.issues[0] || 'Proposed HTML failed validation.',
            ERROR_CODES.VALIDATION,
            { issues: validation.issues },
          )
        }
        try {
          htmlScanFields = await scanHtmlContentForPersistence(proposedContent)
        } catch (scanErr) {
          captureError(scanErr, { tags: { module: 'ai', action: 'sheetApplyEdit.scan' } })
          return sendError(
            res,
            500,
            'HTML scan failed for the AI proposal. Please try again.',
            ERROR_CODES.INTERNAL,
          )
        }
        // Tier-3 (quarantined) AI content lands in the moderation queue
        // instead of going live, matching the normal sheet-write contract.
        if (htmlScanFields.htmlRiskTier === RISK_TIER.QUARANTINED) {
          nextStatus = SHEET_STATUS.QUARANTINED
        }
      }

      // ── Single-transaction write (Codex P2 fix) ────────────────────
      // Compose all three dependent writes inside one `$transaction` so
      // a transient DB error mid-flight can't leave the sheet body
      // updated while one of the surrounding SheetCommit rows is
      // missing. The reversible audit trail this endpoint promises only
      // holds if all three rows commit together or none do.
      const oldContent = sheet.content || ''
      const snapshotChecksum = computeChecksum(oldContent)
      const appliedChecksum = computeChecksum(proposedContent)
      const latestCommit = await prisma.sheetCommit.findFirst({
        where: { sheetId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      const result = await prisma.$transaction(async (tx) => {
        const snap = await tx.sheetCommit.create({
          data: {
            sheetId,
            userId: req.user.userId,
            kind: 'ai_pre_apply',
            message: `Before AI edit: ${snapshotName}${
              snapshotMessage ? ` — ${snapshotMessage}` : ''
            }`,
            content: oldContent,
            contentFormat,
            checksum: snapshotChecksum,
            parentId: latestCommit ? latestCommit.id : null,
          },
          select: { id: true, message: true, createdAt: true, kind: true, checksum: true },
        })

        const sheetUpdateData = {
          content: proposedContent,
          updatedAt: new Date(),
          status: nextStatus,
        }
        if (htmlScanFields) Object.assign(sheetUpdateData, htmlScanFields)

        const updated = await tx.studySheet.update({
          where: { id: sheetId },
          data: sheetUpdateData,
          select: { id: true, content: true, contentFormat: true, status: true, updatedAt: true },
        })

        const applied = await tx.sheetCommit.create({
          data: {
            sheetId,
            userId: req.user.userId,
            kind: 'ai_applied',
            message: snapshotName,
            content: proposedContent,
            contentFormat,
            checksum: appliedChecksum,
            parentId: snap.id,
          },
          select: { id: true, message: true, createdAt: true, kind: true, checksum: true },
        })

        return { snap, applied, updated }
      })

      log.info(
        {
          event: 'ai.sheet.applied_edit',
          sheetId,
          ownerId: sheet.userId,
          snapshotCommitId: result.snap.id,
          appliedCommitId: result.applied.id,
          htmlRiskTier: htmlScanFields?.htmlRiskTier || null,
          quarantined: nextStatus === SHEET_STATUS.QUARANTINED,
        },
        'AI sheet edit applied',
      )

      res.json({
        sheet: result.updated,
        snapshotCommit: result.snap,
        appliedCommit: result.applied,
        quarantined: nextStatus === SHEET_STATUS.QUARANTINED,
      })
    } catch (err) {
      captureError(err, { tags: { module: 'ai', action: 'sheetApplyEdit' } })
      sendError(res, 500, 'Failed to apply AI edit.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
