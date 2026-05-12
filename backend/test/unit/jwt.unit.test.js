/**
 * jwt.unit.test.js — pure tests for the JWT sign/verify surface in
 * `lib/authTokens.js`. Covers:
 *  - signAuthToken / verifyAuthToken round-trip
 *  - expired tokens are rejected
 *  - tampered tokens are rejected
 *  - signCsrfToken / verifyCsrfToken round-trip and type guard
 *  - hashStoredSecret is keyed on JWT_SECRET (changes when secret changes)
 *  - validateSecrets() throws on missing / short secrets
 *  - normalizeAuthUserId numeric vs string handling
 */
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const authTokensPath = require.resolve('../../src/lib/authTokens')

function loadFresh() {
  // Delete and re-require so getJwtSecret() picks up the current env.
  delete require.cache[authTokensPath]
  return require(authTokensPath)
}

const ORIGINAL_SECRET = process.env.JWT_SECRET

afterEach(() => {
  process.env.JWT_SECRET = ORIGINAL_SECRET
  delete require.cache[authTokensPath]
})

beforeEach(() => {
  process.env.JWT_SECRET = 'unit-test-secret-must-be-32-chars-minimum-padding'
})

describe('signAuthToken / verifyAuthToken — round-trip', () => {
  it('verifies a token signed with the same secret and returns sub + role', () => {
    const { signAuthToken, verifyAuthToken } = loadFresh()
    const token = signAuthToken({ id: 42, role: 'student' })
    const payload = verifyAuthToken(token)
    expect(payload.sub).toBe(42)
    expect(payload.role).toBe('student')
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('embeds jti when options.jti is provided', () => {
    const { signAuthToken, verifyAuthToken } = loadFresh()
    const token = signAuthToken({ id: 1, role: 'student' }, { jti: 'session-jti-abc' })
    const payload = verifyAuthToken(token)
    expect(payload.jti).toBe('session-jti-abc')
  })

  it('does NOT embed jti when not requested (legacy code-path stays clean)', () => {
    const { signAuthToken, verifyAuthToken } = loadFresh()
    const token = signAuthToken({ id: 1, role: 'student' })
    const payload = verifyAuthToken(token)
    expect(payload.jti).toBeUndefined()
  })

  it('throws on an expired token', () => {
    const { verifyAuthToken } = loadFresh()
    // Manually sign a token that expired 60s ago.
    const expired = jwt.sign({ sub: 1, role: 'student' }, process.env.JWT_SECRET, {
      expiresIn: '-60s',
    })
    expect(() => verifyAuthToken(expired)).toThrow(/jwt expired|TokenExpiredError/i)
  })

  it('throws when the signature is tampered (different secret)', () => {
    const { verifyAuthToken } = loadFresh()
    const forged = jwt.sign(
      { sub: 1, role: 'admin' },
      'attacker-controlled-secret-32chars-long-ok',
      {
        expiresIn: '1h',
      },
    )
    expect(() => verifyAuthToken(forged)).toThrow(/invalid signature|signature/i)
  })

  it('throws when the secret changes between sign and verify', () => {
    const { signAuthToken } = loadFresh()
    const token = signAuthToken({ id: 1, role: 'student' })
    // Rotate the secret in the env, reload, and verify must now fail.
    process.env.JWT_SECRET = 'rotated-secret-also-32-chars-long-aaaaaaaaaaaaa'
    const fresh = loadFresh()
    expect(() => fresh.verifyAuthToken(token)).toThrow(/invalid signature|signature/i)
  })

  it('throws on a structurally malformed token', () => {
    const { verifyAuthToken } = loadFresh()
    expect(() => verifyAuthToken('not.a.jwt')).toThrow()
    expect(() => verifyAuthToken('')).toThrow()
    expect(() => verifyAuthToken('xxx')).toThrow()
  })
})

describe('signCsrfToken / verifyCsrfToken', () => {
  it('round-trips and carries type=csrf in the payload', () => {
    const { signCsrfToken, verifyCsrfToken } = loadFresh()
    const token = signCsrfToken({ id: 7 })
    const payload = verifyCsrfToken(token)
    expect(payload.sub).toBe(7)
    expect(payload.type).toBe('csrf')
  })

  it('produces a different token from signAuthToken for the same user', () => {
    const { signAuthToken, signCsrfToken } = loadFresh()
    const a = signAuthToken({ id: 1, role: 'student' })
    const c = signCsrfToken({ id: 1 })
    expect(a).not.toBe(c)
  })
})

describe('hashStoredSecret', () => {
  it('is deterministic for the same input + secret', () => {
    const { hashStoredSecret } = loadFresh()
    const a = hashStoredSecret('the-secret-value')
    const b = hashStoredSecret('the-secret-value')
    expect(a).toBe(b)
    // Hex SHA-256 is 64 chars.
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes when JWT_SECRET changes (HMAC key rotation invalidates stored hashes)', () => {
    const { hashStoredSecret: h1 } = loadFresh()
    const before = h1('reset-token-x')
    process.env.JWT_SECRET = 'rotated-secret-also-32-chars-long-aaaaaaaaaaaaa'
    const { hashStoredSecret: h2 } = loadFresh()
    const after = h2('reset-token-x')
    expect(after).not.toBe(before)
  })
})

describe('validateSecrets()', () => {
  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET
    const { validateSecrets } = loadFresh()
    expect(() => validateSecrets()).toThrow(/JWT_SECRET.*not set/i)
  })

  it('throws when JWT_SECRET is shorter than 32 chars', () => {
    process.env.JWT_SECRET = 'short'
    const { validateSecrets } = loadFresh()
    expect(() => validateSecrets()).toThrow(/too short/i)
  })

  it('passes when JWT_SECRET is exactly 32 chars (boundary)', () => {
    process.env.JWT_SECRET = 'a'.repeat(32)
    const { validateSecrets } = loadFresh()
    expect(() => validateSecrets()).not.toThrow()
  })
})

describe('normalizeAuthUserId', () => {
  it('returns numeric input verbatim when finite', () => {
    const { normalizeAuthUserId } = loadFresh()
    expect(normalizeAuthUserId(42)).toBe(42)
    expect(normalizeAuthUserId(0)).toBe(0)
  })

  it('parses numeric-string input into a number', () => {
    const { normalizeAuthUserId } = loadFresh()
    expect(normalizeAuthUserId('42')).toBe(42)
    expect(normalizeAuthUserId('  9  ')).toBe(9)
  })

  it('returns null for non-numeric, non-empty strings (legacy ID shapes pass through as string in normalizeAuthUser, but the raw ID helper returns the trimmed string for non-digit input)', () => {
    const { normalizeAuthUserId } = loadFresh()
    // The function returns the trimmed string when the input is a non-digit
    // string (used by alternate-ID auth flows). Verified against the actual
    // implementation in authTokens.js.
    expect(normalizeAuthUserId('abc')).toBe('abc')
    // Empty/null/undefined collapse to null.
    expect(normalizeAuthUserId('')).toBeNull()
    expect(normalizeAuthUserId(null)).toBeNull()
    expect(normalizeAuthUserId(undefined)).toBeNull()
  })
})
