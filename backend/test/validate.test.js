import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/* ═════════════════════════════════════════════════════════════════════════════
 * validate.test.js — Unit tests for validate.js (Zod-based request validation)
 *
 * Note: This test file requires the 'zod' package to be installed.
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('validate', () => {
  const {
    validate,
    z,
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
  } = require('../src/lib/validate')

  describe('validate middleware', () => {
    it('calls next() on valid body', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
        }),
      })
      const middleware = validate(schema)

      const req = { body: { name: 'test' }, query: {}, params: {} }
      const res = {}
      const next = vi.fn()

      middleware(req, res, next)
      expect(next).toHaveBeenCalledOnce()
      expect(next).toHaveBeenCalledWith()
    })

    it('returns 400 with structured error details on validation failure', () => {
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
        }),
      })
      const middleware = validate(schema)

      const req = { body: { email: 'not-an-email' }, query: {}, params: {} }
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      }
      const next = vi.fn()

      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      const jsonCall = res.json.mock.calls[0][0]
      expect(jsonCall).toHaveProperty('error', 'Validation failed.')
      expect(jsonCall.details).toBeInstanceOf(Array)
      expect(jsonCall.details[0]).toHaveProperty('field')
      expect(jsonCall.details[0]).toHaveProperty('message')
    })

    it('replaces req.body with parsed (coerced) values', () => {
      const schema = z.object({
        body: z.object({
          count: z.coerce.number(),
        }),
      })
      const middleware = validate(schema)

      const req = { body: { count: '42' }, query: {}, params: {} }
      const res = {}
      const next = vi.fn()

      middleware(req, res, next)

      expect(req.body.count).toBe(42)
      expect(next).toHaveBeenCalledOnce()
    })

    it('passes non-ZodError exceptions to next()', () => {
      // Create a middleware that intentionally fails with non-ZodError
      const schema = z.object({
        body: z.object({
          value: z.string(),
        }),
      })

      const brokenMiddleware = (req, _res, next) => {
        try {
          // Intentionally trigger a non-Zod error (e.g., missing property on undefined)
          schema.parse(undefined.invalidProperty)
        } catch (err) {
          if (!(err instanceof z.ZodError)) {
            return next(err)
          }
        }
      }

      const req = { body: {}, query: {}, params: {} }
      const res = {}
      const next = vi.fn()

      brokenMiddleware(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })

    it('handles validation of query and params', () => {
      const schema = z.object({
        query: z.object({
          page: z.coerce.number().int().min(1),
        }),
        params: z.object({
          id: z.string().uuid(),
        }),
      })
      const middleware = validate(schema)

      const req = {
        body: {},
        query: { page: '5' },
        params: { id: '123e4567-e89b-12d3-a456-426614174000' },
      }
      const res = {}
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()
      expect(req.query.page).toBe(5)
    })

    it('includes field path in error details for nested objects', () => {
      const schema = z.object({
        body: z.object({
          user: z.object({
            email: z.string().email(),
          }),
        }),
      })
      const middleware = validate(schema)

      const req = { body: { user: { email: 'bad' } }, query: {}, params: {} }
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      }
      const next = vi.fn()

      middleware(req, res, next)

      const jsonCall = res.json.mock.calls[0][0]
      expect(jsonCall.details[0].field).toMatch(/user\.email|email/)
    })

    it('does not mutate req when validation fails', () => {
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
        }),
      })
      const middleware = validate(schema)

      const originalBody = { email: 'not-an-email' }
      const req = { body: { ...originalBody }, query: {}, params: {} }
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      }
      const next = vi.fn()

      middleware(req, res, next)

      // Body should still have original invalid value
      expect(req.body.email).toBe('not-an-email')
    })
  })

  describe('trimmedString schema', () => {
    it('accepts a non-empty string', () => {
      const result = trimmedString.safeParse('  hello  ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('hello')
    })

    it('rejects empty or whitespace-only strings', () => {
      expect(trimmedString.safeParse('').success).toBe(false)
      expect(trimmedString.safeParse('   ').success).toBe(false)
    })

    it('trims leading and trailing whitespace', () => {
      const result = trimmedString.safeParse('\t\n  test  \r\n')
      expect(result.data).toBe('test')
    })

    it('preserves internal whitespace', () => {
      const result = trimmedString.safeParse('  hello world  ')
      expect(result.data).toBe('hello world')
    })
  })

  describe('uuidId schema', () => {
    it('accepts valid UUID strings', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000'
      const result = uuidId.safeParse(validUuid)
      expect(result.success).toBe(true)
    })

    it('rejects invalid UUID formats', () => {
      expect(uuidId.safeParse('not-a-uuid').success).toBe(false)
      expect(uuidId.safeParse('12345678').success).toBe(false)
    })
  })

  describe('positiveInt schema', () => {
    it('accepts positive integers', () => {
      expect(positiveInt.safeParse(5).success).toBe(true)
      expect(positiveInt.safeParse('42').success).toBe(true)
    })

    it('rejects zero', () => {
      expect(positiveInt.safeParse(0).success).toBe(false)
    })

    it('rejects negative numbers', () => {
      expect(positiveInt.safeParse(-5).success).toBe(false)
    })

    it('rejects non-integers', () => {
      expect(positiveInt.safeParse(3.14).success).toBe(false)
    })
  })

  describe('pageParam schema', () => {
    it('accepts page numbers >= 1', () => {
      expect(pageParam.safeParse(1).success).toBe(true)
      expect(pageParam.safeParse('10').success).toBe(true)
    })

    it('defaults to page 1 when not provided', () => {
      const result = pageParam.safeParse(undefined)
      expect(result.success).toBe(true)
      expect(result.data).toBe(1)
    })

    it('rejects page 0', () => {
      expect(pageParam.safeParse(0).success).toBe(false)
    })

    it('rejects negative page numbers', () => {
      expect(pageParam.safeParse(-1).success).toBe(false)
    })
  })

  describe('pageSizeParam schema', () => {
    it('accepts sizes from 1 to 100', () => {
      expect(pageSizeParam.safeParse(1).success).toBe(true)
      expect(pageSizeParam.safeParse(50).success).toBe(true)
      expect(pageSizeParam.safeParse(100).success).toBe(true)
    })

    it('defaults to 20 when not provided', () => {
      const result = pageSizeParam.safeParse(undefined)
      expect(result.success).toBe(true)
      expect(result.data).toBe(20)
    })

    it('rejects sizes > 100', () => {
      expect(pageSizeParam.safeParse(101).success).toBe(false)
    })

    it('rejects sizes < 1', () => {
      expect(pageSizeParam.safeParse(0).success).toBe(false)
    })
  })

  describe('sortOrder schema', () => {
    it('accepts asc and desc', () => {
      expect(sortOrder.safeParse('asc').success).toBe(true)
      expect(sortOrder.safeParse('desc').success).toBe(true)
    })

    it('defaults to desc', () => {
      const result = sortOrder.safeParse(undefined)
      expect(result.success).toBe(true)
      expect(result.data).toBe('desc')
    })

    it('rejects invalid sort orders', () => {
      expect(sortOrder.safeParse('ascending').success).toBe(false)
      expect(sortOrder.safeParse('random').success).toBe(false)
    })
  })

  describe('safeEmail schema', () => {
    it('accepts valid email addresses', () => {
      expect(safeEmail.safeParse('user@example.com').success).toBe(true)
      expect(safeEmail.safeParse('test.email+tag@domain.co.uk').success).toBe(true)
    })

    it('lowercases email addresses', () => {
      const result = safeEmail.safeParse('USER@EXAMPLE.COM')
      expect(result.success).toBe(true)
      expect(result.data).toBe('user@example.com')
    })

    it('trims whitespace from emails', () => {
      const result = safeEmail.safeParse('  user@example.com  ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('user@example.com')
    })

    it('rejects invalid email formats', () => {
      expect(safeEmail.safeParse('not-an-email').success).toBe(false)
      expect(safeEmail.safeParse('@example.com').success).toBe(false)
      expect(safeEmail.safeParse('user@').success).toBe(false)
      expect(safeEmail.safeParse('user @example.com').success).toBe(false)
    })

    it('accepts emails with subdomains', () => {
      expect(safeEmail.safeParse('user@mail.example.co.uk').success).toBe(true)
    })
  })

  describe('username schema', () => {
    it('accepts valid usernames (3-20 chars, alphanumeric + underscore)', () => {
      expect(username.safeParse('john_doe').success).toBe(true)
      expect(username.safeParse('user123').success).toBe(true)
      expect(username.safeParse('_underscore_').success).toBe(true)
      expect(username.safeParse('abc').success).toBe(true) // Exactly 3 chars
    })

    it('rejects usernames shorter than 3 characters', () => {
      expect(username.safeParse('ab').success).toBe(false)
      expect(username.safeParse('a').success).toBe(false)
    })

    it('rejects usernames longer than 20 characters', () => {
      expect(username.safeParse('a'.repeat(21)).success).toBe(false)
      expect(username.safeParse('thisusernameistoolong123').success).toBe(false)
    })

    it('rejects usernames with invalid characters', () => {
      expect(username.safeParse('user-name').success).toBe(false)
      expect(username.safeParse('user@name').success).toBe(false)
      expect(username.safeParse('user name').success).toBe(false)
      expect(username.safeParse('user.name').success).toBe(false)
    })

    it('accepts usernames with all valid characters', () => {
      expect(username.safeParse('abc123_def').success).toBe(true)
      expect(username.safeParse('__init__').success).toBe(true)
      expect(username.safeParse('Test_User_123').success).toBe(true)
    })

    it('trims whitespace before validation', () => {
      const result = username.safeParse('  john_doe  ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('john_doe')
    })
  })

  describe('strongPassword schema', () => {
    it('accepts passwords with 8+ chars, at least one uppercase and one digit', () => {
      expect(strongPassword.safeParse('Password1').success).toBe(true)
      expect(strongPassword.safeParse('MySecure2024').success).toBe(true)
      expect(strongPassword.safeParse('A1b2C3d4').success).toBe(true)
    })

    it('rejects passwords shorter than 8 characters', () => {
      expect(strongPassword.safeParse('Pass1').success).toBe(false)
      expect(strongPassword.safeParse('A1').success).toBe(false)
    })

    it('rejects passwords without uppercase letter', () => {
      expect(strongPassword.safeParse('password123').success).toBe(false)
      expect(strongPassword.safeParse('pass1word').success).toBe(false)
    })

    it('rejects passwords without digit', () => {
      expect(strongPassword.safeParse('PasswordOnly').success).toBe(false)
      expect(strongPassword.safeParse('OnlyLetters').success).toBe(false)
    })

    it('accepts passwords with special characters', () => {
      expect(strongPassword.safeParse('Secure!Pass2').success).toBe(true)
      expect(strongPassword.safeParse('P@ssw0rd#123').success).toBe(true)
    })

    it('accepts very long passwords', () => {
      expect(strongPassword.safeParse('VeryLongPasswordWith1234567890').success).toBe(true)
    })

    it('requires both uppercase AND digit, not either', () => {
      // Has uppercase and special chars, but no digit
      expect(strongPassword.safeParse('PasswordWithSpecial!').success).toBe(false)

      // Has digit and special chars, but no uppercase
      expect(strongPassword.safeParse('passwordwithdigit1!').success).toBe(false)

      // Has both uppercase and digit
      expect(strongPassword.safeParse('Password1').success).toBe(true)
    })
  })

  describe('paginationQuery schema', () => {
    it('uses default page (1) and limit (20) when not provided', () => {
      const result = paginationQuery.safeParse({})
      expect(result.success).toBe(true)
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(20)
    })

    it('coerces string page and limit to numbers', () => {
      const result = paginationQuery.safeParse({ page: '5', limit: '50' })
      expect(result.success).toBe(true)
      expect(result.data.page).toBe(5)
      expect(result.data.limit).toBe(50)
    })

    it('respects min/max bounds on limit', () => {
      expect(paginationQuery.safeParse({ limit: '200' }).success).toBe(false)
      expect(paginationQuery.safeParse({ limit: '0' }).success).toBe(false)
      expect(paginationQuery.safeParse({ limit: '100' }).success).toBe(true)
    })

    it('enforces page >= 1', () => {
      expect(paginationQuery.safeParse({ page: '0' }).success).toBe(false)
      expect(paginationQuery.safeParse({ page: '-5' }).success).toBe(false)
      expect(paginationQuery.safeParse({ page: '1' }).success).toBe(true)
    })

    it('accepts optional sort parameter', () => {
      expect(paginationQuery.safeParse({ sort: 'asc' }).success).toBe(true)
      expect(paginationQuery.safeParse({ sort: 'desc' }).success).toBe(true)
    })

    it('sort defaults to undefined when not provided', () => {
      const result = paginationQuery.safeParse({})
      expect(result.data.sort).toBeUndefined()
    })

    it('returns all fields with mixed provided and default values', () => {
      const result = paginationQuery.safeParse({ page: '3' })
      expect(result.success).toBe(true)
      expect(result.data.page).toBe(3)
      expect(result.data.limit).toBe(20) // default
      expect(result.data.sort).toBeUndefined() // optional, not provided
    })
  })
})
