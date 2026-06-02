/**
 * zodSchemas/index.js -- Shared zod schemas for runtime contract validation.
 *
 * Why zod:
 *   Hand-rolled `Number.parseInt(x, 10) + Number.isInteger + clamp + slice`
 *   chains are scattered across ~40 route handlers. They each enforce the
 *   same contract (positive int, NaN-rejected; string 1–N chars, trimmed;
 *   enum allowlist) but the implementations drift, miss edge cases, and
 *   make new endpoints copy-paste-error magnets. zod is the de-facto JS
 *   schema validator (~14 KB gzipped) — single source of truth for the
 *   contract, structured error reporting, and trivial test coverage.
 *
 * Pattern:
 *   const parsed = aiInstructionBodySchema.safeParse(req.body)
 *   if (!parsed.success) {
 *     return sendError(res, 400, parsed.error.issues[0].message, ERROR_CODES.VALIDATION)
 *   }
 *   const { instruction } = parsed.data
 *
 * Custom error messages on every refinement so the 400 response reads
 * like a human wrote it ("Instruction is required.") rather than zod's
 * default ("String must contain at least 1 character(s)").
 *
 * This file only exports primitives + schemas; no side effects, no
 * import of prisma/express. Safe to import from anywhere.
 *
 * Migration scope: the three high-traffic AI endpoints (analyze,
 * propose-edit, apply-edit). Other modules continue to use the inline
 * pattern until they're migrated. CLAUDE.md A12/A13 still apply — zod is
 * one allowed implementation of the same contract.
 */

const { z } = require('zod')

// ── Primitives ──────────────────────────────────────────────────────────

/**
 * Positive integer ID coerced from string (URL params arrive as strings).
 * Rejects NaN, 0, negatives, floats. Matches the CLAUDE.md A12 guard:
 *   Number.parseInt(x, 10) + Number.isInteger(n) + n >= 1
 *
 * Use:
 *   const id = sheetIdSchema.parse(req.params.sheetId)
 * OR
 *   const parsed = sheetIdSchema.safeParse(req.params.sheetId)
 */
const positiveIntFromStringSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? Number.parseInt(v, 10) : v))
  .refine((n) => Number.isInteger(n) && n >= 1, { message: 'Invalid id.' })

/** Sheet IDs are positive integers. Alias for clarity at call sites. */
const sheetIdSchema = positiveIntFromStringSchema

/**
 * AI free-text instruction. Trim + reject empty. Slice to 2000 chars
 * (matches the prior MAX_INSTRUCTION_LENGTH = 2000 in ai.sheet.routes).
 * Note: we TRUNCATE rather than REJECT long instructions because that's
 * the existing contract (test `truncates instructions over 2000 chars
 * (does not 400, accepts clamped)` asserts this).
 */
const MAX_INSTRUCTION_LENGTH = 2000
const aiInstructionSchema = z
  .string({
    required_error: 'Instruction is required.',
    invalid_type_error: 'Instruction is required.',
  })
  .transform((s) => (typeof s === 'string' ? s.trim().slice(0, MAX_INSTRUCTION_LENGTH) : ''))
  .refine((s) => s.length >= 1, { message: 'Instruction is required.' })

/**
 * AI-proposed content (markdown or HTML). Trim, reject empty, reject
 * over 1,000,000 chars. Matches the prior inline pattern in
 * apply-edit.
 */
const MAX_PROPOSED_CONTENT_LENGTH = 1_000_000
const proposedContentSchema = z
  .string({
    required_error: 'proposedContent is required.',
    invalid_type_error: 'proposedContent is required.',
  })
  .transform((s) => (typeof s === 'string' ? s.trim() : ''))
  .pipe(
    z
      .string()
      .min(1, { message: 'proposedContent is required.' })
      .max(MAX_PROPOSED_CONTENT_LENGTH, { message: 'Proposal exceeds maximum size.' }),
  )

/**
 * Snapshot name for SheetCommit messages. 1–120 chars, trimmed,
 * required. The prior inline pattern silently clamped past 120 to keep
 * the SheetCommit.message readable.
 */
const snapshotNameSchema = z
  .string({
    required_error: 'snapshotName is required.',
    invalid_type_error: 'snapshotName is required.',
  })
  .transform((s) => (typeof s === 'string' ? s.trim().slice(0, 120) : ''))
  .refine((s) => s.length >= 1, { message: 'snapshotName is required.' })

/** Optional snapshot rationale. 0–500 chars, trimmed, defaults to ''. */
const snapshotMessageSchema = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((s) => (typeof s === 'string' ? s.trim().slice(0, 500) : ''))

// ── Pagination ──────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/**
 * Pagination from `req.query`. Both fields optional; defaults match
 * lib/constants.clampPage / clampLimit so callers can drop-in this
 * schema in place of the existing helpers.
 *
 * Returns: { page: number >= 1, limit: number in [1, MAX_PAGE_SIZE], offset: number >= 0 }
 */
const paginationSchema = z
  .object({
    page: z.union([z.string(), z.number(), z.undefined()]).transform((v) => {
      if (v === undefined || v === null || v === '') return 1
      const n = typeof v === 'string' ? Number.parseInt(v, 10) : v
      return Number.isInteger(n) && n >= 1 ? n : 1
    }),
    limit: z.union([z.string(), z.number(), z.undefined()]).transform((v) => {
      if (v === undefined || v === null || v === '') return DEFAULT_PAGE_SIZE
      const n = typeof v === 'string' ? Number.parseInt(v, 10) : v
      if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE
      return Math.min(MAX_PAGE_SIZE, n)
    }),
  })
  .transform(({ page, limit }) => ({ page, limit, offset: (page - 1) * limit }))

// ── AI sheet endpoint bodies ────────────────────────────────────────────

/**
 * POST /api/ai/sheets/:id/analyze — body has no required fields today
 * but we still parse it so future fields (`focus`, `style`, etc.) land
 * in one place. `.passthrough()` is intentionally NOT used: unknown
 * fields are silently dropped so a malicious client can't smuggle extra
 * data through. zod default behavior is to strip unknown keys.
 */
const aiAnalyzeBodySchema = z.object({}).optional().default({})

/**
 * POST /api/ai/sheets/:id/propose-edit — instruction required.
 */
const aiProposeBodySchema = z.object({
  instruction: aiInstructionSchema,
})

/**
 * POST /api/ai/sheets/:id/apply-edit — proposedContent + snapshotName
 * required, snapshotMessage optional.
 */
const aiApplyBodySchema = z.object({
  proposedContent: proposedContentSchema,
  snapshotName: snapshotNameSchema,
  snapshotMessage: snapshotMessageSchema,
})

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the first human-readable message from a ZodError. zod returns
 * `error.issues[0].message` which is the custom string we set above
 * (e.g., "Instruction is required."). Falls back to a generic line if
 * the issues array is somehow empty.
 */
function firstZodMessage(error, fallback = 'Invalid request body.') {
  if (!error || !Array.isArray(error.issues) || error.issues.length === 0) return fallback
  const issue = error.issues[0]
  return typeof issue.message === 'string' && issue.message.length > 0 ? issue.message : fallback
}

module.exports = {
  // Primitives
  positiveIntFromStringSchema,
  sheetIdSchema,
  aiInstructionSchema,
  proposedContentSchema,
  snapshotNameSchema,
  snapshotMessageSchema,
  paginationSchema,

  // AI sheet bodies
  aiAnalyzeBodySchema,
  aiProposeBodySchema,
  aiApplyBodySchema,

  // Helpers
  firstZodMessage,

  // Re-export constants for callers that need them outside the schema
  // (e.g., test fixtures, prompt-side truncation).
  MAX_INSTRUCTION_LENGTH,
  MAX_PROPOSED_CONTENT_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
}
