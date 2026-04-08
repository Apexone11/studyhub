import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/* ═════════════════════════════════════════════════════════════════════════════
 * core-utils.test.js — Unit tests for constants, authTokens, cache, and blockFilter
 *
 * Note: validate.js tests require the 'zod' package and are in a separate file.
 * See validate.test.js for Zod schema validation tests.
 * ═════════════════════════════════════════════════════════════════════════════ */

// ── constants.js tests ───────────────────────────────────────────────────────

describe('constants', () => {
  const constants = require('../src/lib/constants')

  describe('clampLimit', () => {
    it('returns default size when raw is not a number', () => {
      expect(constants.clampLimit('not-a-number')).toBe(constants.DEFAULT_PAGE_SIZE)
      expect(constants.clampLimit(undefined)).toBe(constants.DEFAULT_PAGE_SIZE)
      expect(constants.clampLimit(null)).toBe(constants.DEFAULT_PAGE_SIZE)
    })

    it('clamps a valid number within bounds', () => {
      expect(constants.clampLimit('50')).toBe(50)
      expect(constants.clampLimit(30)).toBe(30)
    })

    it('parses string numbers correctly', () => {
      expect(constants.clampLimit('42')).toBe(42)
    })

    it('returns max size when limit exceeds MAX_PAGE_SIZE', () => {
      expect(constants.clampLimit('200')).toBe(constants.MAX_PAGE_SIZE)
      expect(constants.clampLimit(150)).toBe(constants.MAX_PAGE_SIZE)
    })

    it('returns default size for zero', () => {
      expect(constants.clampLimit(0)).toBe(constants.DEFAULT_PAGE_SIZE)
      expect(constants.clampLimit('0')).toBe(constants.DEFAULT_PAGE_SIZE)
    })

    it('returns default size for negative numbers', () => {
      expect(constants.clampLimit(-5)).toBe(constants.DEFAULT_PAGE_SIZE)
      expect(constants.clampLimit('-10')).toBe(constants.DEFAULT_PAGE_SIZE)
    })

    it('respects custom defaultSize and maxSize options', () => {
      expect(constants.clampLimit('200', { defaultSize: 50, maxSize: 150 })).toBe(150)
      expect(constants.clampLimit('invalid', { defaultSize: 75 })).toBe(75)
      expect(constants.clampLimit(5, { maxSize: 10 })).toBe(5)
    })

    it('returns 1 as minimum valid value', () => {
      expect(constants.clampLimit('1')).toBe(1)
    })
  })

  describe('clampPage', () => {
    it('returns 1 for default page when raw is not a number', () => {
      expect(constants.clampPage('not-a-number')).toBe(1)
      expect(constants.clampPage(undefined)).toBe(1)
      expect(constants.clampPage(null)).toBe(1)
    })

    it('returns valid page number as-is', () => {
      expect(constants.clampPage('5')).toBe(5)
      expect(constants.clampPage(42)).toBe(42)
    })

    it('returns 1 for zero', () => {
      expect(constants.clampPage(0)).toBe(1)
      expect(constants.clampPage('0')).toBe(1)
    })

    it('returns 1 for negative numbers', () => {
      expect(constants.clampPage(-5)).toBe(1)
      expect(constants.clampPage('-10')).toBe(1)
    })

    it('parses string numbers correctly', () => {
      expect(constants.clampPage('100')).toBe(100)
    })

    it('handles very large page numbers', () => {
      expect(constants.clampPage('999999')).toBe(999999)
    })
  })

  describe('time window constants', () => {
    it('WINDOW_1_MIN is 60 seconds in milliseconds', () => {
      expect(constants.WINDOW_1_MIN).toBe(60 * 1000)
    })

    it('WINDOW_5_MIN is 5 minutes in milliseconds', () => {
      expect(constants.WINDOW_5_MIN).toBe(5 * 60 * 1000)
    })

    it('WINDOW_15_MIN is 15 minutes in milliseconds', () => {
      expect(constants.WINDOW_15_MIN).toBe(15 * 60 * 1000)
    })

    it('WINDOW_1_HOUR is 1 hour in milliseconds', () => {
      expect(constants.WINDOW_1_HOUR).toBe(60 * 60 * 1000)
    })

    it('WINDOW_1_DAY is 1 day in milliseconds', () => {
      expect(constants.WINDOW_1_DAY).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe('content limit constants', () => {
    it('MAX_MESSAGE_LENGTH is 5000 characters', () => {
      expect(constants.MAX_MESSAGE_LENGTH).toBe(5000)
    })

    it('MAX_ANNOUNCEMENT_LENGTH is 25000 characters', () => {
      expect(constants.MAX_ANNOUNCEMENT_LENGTH).toBe(25000)
    })

    it('MAX_DONATION_MESSAGE_LENGTH is 500 characters', () => {
      expect(constants.MAX_DONATION_MESSAGE_LENGTH).toBe(500)
    })
  })

  describe('pagination constants', () => {
    it('DEFAULT_PAGE_SIZE is 20', () => {
      expect(constants.DEFAULT_PAGE_SIZE).toBe(20)
    })

    it('MAX_PAGE_SIZE is 100', () => {
      expect(constants.MAX_PAGE_SIZE).toBe(100)
    })
  })
})

// ── cache.js tests ───────────────────────────────────────────────────────────

describe('MemoryCache', () => {
  const { MemoryCache } = require('../src/lib/cache')
  let cache

  beforeEach(() => {
    cache = new MemoryCache(100) // 100ms default TTL for tests
  })

  describe('basic set/get', () => {
    it('stores and retrieves a value', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
    })

    it('returns undefined for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('stores different value types', () => {
      cache.set('str', 'string')
      cache.set('num', 42)
      cache.set('obj', { a: 1 })
      cache.set('arr', [1, 2, 3])

      expect(cache.get('str')).toBe('string')
      expect(cache.get('num')).toBe(42)
      expect(cache.get('obj')).toEqual({ a: 1 })
      expect(cache.get('arr')).toEqual([1, 2, 3])
    })

    it('stores null and false values correctly', () => {
      cache.set('null', null)
      cache.set('false', false)

      expect(cache.get('null')).toBe(null)
      expect(cache.get('false')).toBe(false)
    })
  })

  describe('TTL and expiry', () => {
    it('returns undefined for expired entries', async () => {
      cache.set('key1', 'value1', 50) // 50ms TTL
      expect(cache.get('key1')).toBe('value1')

      await new Promise((r) => setTimeout(r, 60))
      expect(cache.get('key1')).toBeUndefined()
    })

    it('uses default TTL when not specified', async () => {
      const shortCache = new MemoryCache(50) // 50ms default
      shortCache.set('key1', 'value1')

      expect(shortCache.get('key1')).toBe('value1')
      await new Promise((r) => setTimeout(r, 60))
      expect(shortCache.get('key1')).toBeUndefined()
    })

    it('allows custom TTL to override default', async () => {
      const defaultCache = new MemoryCache(1000) // 1s default
      defaultCache.set('key1', 'value1', 50) // Override with 50ms

      await new Promise((r) => setTimeout(r, 60))
      expect(defaultCache.get('key1')).toBeUndefined()
    })

    it('keeps non-expired entries after TTL check', async () => {
      cache.set('key1', 'value1', 200)
      cache.set('key2', 'value2', 50)

      await new Promise((r) => setTimeout(r, 60))
      expect(cache.get('key1')).toBe('value1')
      expect(cache.get('key2')).toBeUndefined()
    })
  })

  describe('del', () => {
    it('removes a key from cache', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')

      cache.del('key1')
      expect(cache.get('key1')).toBeUndefined()
    })

    it('does not error when deleting non-existent key', () => {
      expect(() => cache.del('nonexistent')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.clear()

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBeUndefined()
    })

    it('resets statistics on clear', () => {
      cache.set('key1', 'value1')
      cache.get('key1')
      cache.get('nonexistent')

      const before = cache.stats.hits + cache.stats.misses
      expect(before).toBeGreaterThan(0)

      cache.clear()

      expect(cache.stats.hits).toBe(0)
      expect(cache.stats.misses).toBe(0)
    })
  })

  describe('statistics', () => {
    it('tracks cache hits', () => {
      cache.set('key1', 'value1')

      cache.get('key1')
      cache.get('key1')

      expect(cache.stats.hits).toBe(2)
    })

    it('tracks cache misses', () => {
      cache.get('nonexistent1')
      cache.get('nonexistent2')

      expect(cache.stats.misses).toBe(2)
    })

    it('calculates total accesses', () => {
      cache.set('key1', 'value1')

      cache.get('key1') // hit
      cache.get('key1') // hit
      cache.get('nonexistent') // miss

      const total = cache.stats.hits + cache.stats.misses
      expect(total).toBe(3)
      expect(cache.stats.hits).toBe(2)
    })

    it('tracks hit and miss statistics together', () => {
      cache.set('key1', 'value1')
      cache.get('key1') // hit
      cache.get('nonexistent') // miss

      expect(cache.stats.hits).toBe(1)
      expect(cache.stats.misses).toBe(1)
    })
  })
})

// ── authTokens.js tests ──────────────────────────────────────────────────────

describe('authTokens', () => {
  const authTokens = require('../src/lib/authTokens')

  const testSecret = crypto.randomBytes(64).toString('hex')

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret
  })

  afterEach(() => {
    delete process.env.JWT_SECRET
  })

  describe('signAuthToken and verifyAuthToken', () => {
    it('roundtrips a user token', () => {
      const user = { id: 'user-123', role: 'student' }
      const token = authTokens.signAuthToken(user)

      const payload = authTokens.verifyAuthToken(token)
      expect(payload.sub).toBe('user-123')
      expect(payload.role).toBe('student')
    })

    it('includes standard JWT claims', () => {
      const user = { id: 'user-456', role: 'admin' }
      const token = authTokens.signAuthToken(user)

      const payload = authTokens.verifyAuthToken(token)
      expect(payload).toHaveProperty('iat') // issued at
      expect(payload).toHaveProperty('exp') // expiration
    })

    it('rejects tampered tokens', () => {
      const user = { id: 'user-123', role: 'student' }
      const token = authTokens.signAuthToken(user)

      const tampered = token.slice(0, -5) + 'xxxxx'
      expect(() => authTokens.verifyAuthToken(tampered)).toThrow()
    })

    it('rejects tokens signed with different secret', () => {
      const user = { id: 'user-123', role: 'student' }
      const token = authTokens.signAuthToken(user)

      process.env.JWT_SECRET = crypto.randomBytes(64).toString('hex')
      expect(() => authTokens.verifyAuthToken(token)).toThrow()
    })

    it('handles token expiration (future test scenario)', () => {
      // Note: We can't easily test expiration without mocking time
      // but we verify the structure is correct
      const user = { id: 'user-123', role: 'student' }
      const token = authTokens.signAuthToken(user)
      const payload = authTokens.verifyAuthToken(token)

      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })
  })

  describe('signCsrfToken and verifyCsrfToken', () => {
    it('roundtrips a CSRF token', () => {
      const user = { id: 'user-789' }
      const token = authTokens.signCsrfToken(user)

      const payload = authTokens.verifyCsrfToken(token)
      expect(payload.sub).toBe('user-789')
      expect(payload.type).toBe('csrf')
    })

    it('rejects CSRF tokens signed with different secret', () => {
      const user = { id: 'user-789' }
      const token = authTokens.signCsrfToken(user)

      process.env.JWT_SECRET = crypto.randomBytes(64).toString('hex')
      expect(() => authTokens.verifyCsrfToken(token)).toThrow()
    })

    it('includes type=csrf in payload', () => {
      const user = { id: 'user-789' }
      const token = authTokens.signCsrfToken(user)
      const payload = authTokens.verifyCsrfToken(token)

      expect(payload.type).toBe('csrf')
    })
  })

  describe('validateSecrets', () => {
    it('throws if JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET
      expect(() => authTokens.validateSecrets()).toThrow(/JWT_SECRET/)
    })

    it('throws if JWT_SECRET is too short', () => {
      process.env.JWT_SECRET = 'short'
      expect(() => authTokens.validateSecrets()).toThrow(/too short/)
    })

    it('passes with valid secret length', () => {
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex')
      expect(() => authTokens.validateSecrets()).not.toThrow()
    })

    it('minimum secret length is 32 characters', () => {
      process.env.JWT_SECRET = crypto.randomBytes(16).toString('hex') // 32 hex chars = 16 bytes
      expect(() => authTokens.validateSecrets()).not.toThrow()

      process.env.JWT_SECRET = 'a'.repeat(31)
      expect(() => authTokens.validateSecrets()).toThrow()
    })
  })

  describe('getAuthTokenFromRequest', () => {
    it('extracts Bearer token from Authorization header', () => {
      const req = {
        headers: {
          authorization: 'Bearer my-token-value',
        },
      }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBe('my-token-value')
    })

    it('is case-insensitive for Bearer scheme', () => {
      const req = {
        headers: {
          authorization: 'bearer my-token-value',
        },
      }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBe('my-token-value')
    })

    it('returns null when Authorization header is missing', () => {
      const req = { headers: {} }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBeNull()
    })

    it('returns null when Authorization is not Bearer', () => {
      const req = {
        headers: {
          authorization: 'Basic xyz',
        },
      }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBeNull()
    })

    it('falls back to cookie when Bearer header is missing', () => {
      const req = {
        headers: {
          cookie: 'studyhub_session=cookie-token-value; other=data',
        },
      }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBe('cookie-token-value')
    })

    it('prefers Bearer header over cookie', () => {
      const req = {
        headers: {
          authorization: 'Bearer bearer-token',
          cookie: 'studyhub_session=cookie-token; other=data',
        },
      }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBe('bearer-token')
    })

    it('returns null when neither header nor cookie present', () => {
      const req = { headers: {} }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBeNull()
    })

    it('handles malformed Authorization header gracefully', () => {
      const req = {
        headers: {
          authorization: 'Bearer', // Missing token
        },
      }

      const token = authTokens.getAuthTokenFromRequest(req)
      expect(token).toBeNull()
    })
  })

  describe('hashStoredSecret', () => {
    it('returns a consistent hash for the same value', () => {
      const value = 'my-secret-value'
      const hash1 = authTokens.hashStoredSecret(value)
      const hash2 = authTokens.hashStoredSecret(value)

      expect(hash1).toBe(hash2)
    })

    it('returns a hex-encoded string', () => {
      const value = 'test-secret'
      const hash = authTokens.hashStoredSecret(value)

      expect(typeof hash).toBe('string')
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
    })

    it('produces different hashes for different values', () => {
      const hash1 = authTokens.hashStoredSecret('secret1')
      const hash2 = authTokens.hashStoredSecret('secret2')

      expect(hash1).not.toBe(hash2)
    })

    it('produces consistent 64-char SHA256 hex hash', () => {
      const value = 'test'
      const hash = authTokens.hashStoredSecret(value)

      expect(hash.length).toBe(64) // SHA256 produces 32 bytes = 64 hex chars
    })

    it('requires JWT_SECRET to be set', () => {
      delete process.env.JWT_SECRET
      expect(() => authTokens.hashStoredSecret('value')).toThrow()
    })

    it('uses JWT_SECRET as HMAC key', () => {
      const value = 'test-value'
      process.env.JWT_SECRET = testSecret

      // We can verify this by checking consistency across different secret values
      const hash1 = authTokens.hashStoredSecret(value)

      // Change secret and verify hash changes
      process.env.JWT_SECRET = crypto.randomBytes(64).toString('hex')
      const hash2 = authTokens.hashStoredSecret(value)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('constants', () => {
    it('AUTH_COOKIE_NAME is studyhub_session', () => {
      expect(authTokens.AUTH_COOKIE_NAME).toBe('studyhub_session')
    })
  })

  describe('getAuthCookieTokenFromRequest', () => {
    it('extracts auth token from cookie', () => {
      const req = {
        headers: {
          cookie: 'studyhub_session=token-value; other=data',
        },
      }

      const token = authTokens.getAuthCookieTokenFromRequest(req)
      expect(token).toBe('token-value')
    })

    it('returns null when cookie not present', () => {
      const req = { headers: {} }

      const token = authTokens.getAuthCookieTokenFromRequest(req)
      expect(token).toBeNull()
    })

    it('handles URL-encoded cookie values', () => {
      const req = {
        headers: {
          cookie: 'studyhub_session=encoded%20value; other=data',
        },
      }

      const token = authTokens.getAuthCookieTokenFromRequest(req)
      expect(token).toBe('encoded value')
    })

    it('falls back to the raw cookie value when decoding fails', () => {
      const req = {
        headers: {
          cookie: 'studyhub_session=bad%cookie; other=data',
        },
      }

      const token = authTokens.getAuthCookieTokenFromRequest(req)
      expect(token).toBe('bad%cookie')
    })
  })
})
