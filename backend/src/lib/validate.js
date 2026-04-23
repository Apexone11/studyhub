/* ═══════════════════════════════════════════════════════════════════════════
 * validate.js — Zod-based request validation middleware
 *
 * Provides a reusable Express middleware that validates req.body, req.query,
 * and req.params against Zod schemas. Replaces manual if-typeof checks with
 * declarative, type-safe validation used by Stripe, Vercel, and Linear.
 *
 * Usage in routes:
 *
 *   const { z } = require('zod')
 *   const { validate } = require('../../lib/validate')
 *
 *   const createSheetSchema = z.object({
 *     body: z.object({
 *       title: z.string().min(1).max(200),
 *       courseId: z.string().uuid(),
 *       content: z.string().min(1),
 *       visibility: z.enum(['public', 'private', 'unlisted']).default('public'),
 *     }),
 *   })
 *
 *   router.post('/', requireAuth, validate(createSheetSchema), async (req, res) => {
 *     // req.body is now typed and guaranteed valid
 *   })
 *
 * ═══════════════════════════════════════════════════════════════════════════ */
const { z, ZodError } = require('zod')

/**
 * Express middleware factory that validates request data against a Zod schema.
 *
 * The schema should be a z.object with optional keys: body, query, params.
 * On validation failure, returns 400 with structured error messages.
 * On success, replaces req.body/query/params with the parsed (coerced) values.
 *
 * @param {z.ZodObject} schema - Zod schema with body/query/params keys
 * @returns {Function} Express middleware
 */
function validate(schema) {
  return (req, _res, next) => {
    try {
      const result = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      })

      // Replace raw values with parsed (trimmed, coerced, defaulted) values
      if (result.body) req.body = result.body
      if (result.query) req.query = result.query
      if (result.params) req.params = result.params

      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))

        return _res.status(400).json({
          error: 'Validation failed.',
          details: errors,
        })
      }

      next(err)
    }
  }
}

/* ── Common reusable field schemas ────────────────────────────────────── */

/** Trimmed non-empty string */
const trimmedString = z.string().trim().min(1)

/** UUID string (for IDs) */
const uuidId = z.string().uuid()

/** Positive integer (for pagination) */
const positiveInt = z.coerce.number().int().positive()

/** Page number with default */
const pageParam = z.coerce.number().int().min(1).default(1)

/** Page size with bounds */
const pageSizeParam = z.coerce.number().int().min(1).max(100).default(20)

/** Sort direction */
const sortOrder = z.enum(['asc', 'desc']).default('desc')

/** Safe email with normalization */
const safeEmail = z.string().trim().toLowerCase().email()

/** Username: 3-20 chars, alphanumeric + underscores */
const username = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z0-9_]{3,20}$/,
    'Username must be 3-20 characters using only letters, numbers, and underscores.',
  )

/** Password: min 8 chars, at least one uppercase and one digit */
const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .refine(
    (val) => /[A-Z]/.test(val) && /\d/.test(val),
    'Password must include at least one capital letter and one number.',
  )

/** Pagination query schema -- reuse in any list endpoint */
const paginationQuery = z.object({
  page: pageParam,
  limit: pageSizeParam,
  sort: sortOrder.optional(),
})

module.exports = {
  validate,
  z,
  // Reusable field schemas
  trimmedString,
  uuidId,
  positiveInt,
  pageParam,
  pageSizeParam,
  sortOrder,
  safeEmail,
  username,
  strongPassword,
  paginationQuery,
}
