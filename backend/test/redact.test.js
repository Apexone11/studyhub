import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { REDACTED, maskEmail, redactObject, redactHeaders, safeRequestContext } = require('../src/lib/redact')

describe('redact', () => {
  describe('maskEmail', () => {
    it('masks email keeping first char and domain', () => {
      expect(maskEmail('test@example.com')).toBe('t***@example.com')
    })

    it('masks single-char local part', () => {
      expect(maskEmail('a@b.com')).toBe('a***@b.com')
    })

    it('redacts non-email strings', () => {
      expect(maskEmail('not-an-email')).toBe(REDACTED)
    })

    it('redacts non-string values', () => {
      expect(maskEmail(null)).toBe(REDACTED)
      expect(maskEmail(123)).toBe(REDACTED)
    })
  })

  describe('redactObject', () => {
    it('redacts password fields', () => {
      const input = { username: 'alice', password: 'secret123' }
      const result = redactObject(input)
      expect(result.username).toBe('alice')
      expect(result.password).toBe(REDACTED)
    })

    it('redacts nested sensitive fields', () => {
      const input = { user: { email: 'test@test.com', token: 'abc123' } }
      const result = redactObject(input)
      expect(result.user.email).toBe('t***@test.com')
      expect(result.user.token).toBe(REDACTED)
    })

    it('redacts all known sensitive keys', () => {
      const cases = [
        'passwordHash', 'newPassword', 'currentPassword', 'confirmPassword',
        'token', 'accessToken', 'refreshToken', 'resetToken', 'jwt',
        'cookie', 'cookies', 'authorization', 'set-cookie', 'x-csrf-token',
        'twoFaCode', 'emailVerificationCode',
        'ciphertext', 'encryptedDataKey', 'plaintext',
        'secretKey', 'apiKey', 'secret',
      ]
      for (const key of cases) {
        const result = redactObject({ [key]: 'sensitive-value' })
        expect(result[key]).toBe(REDACTED)
      }
    })

    it('masks email fields instead of fully redacting', () => {
      const result = redactObject({ email: 'admin@studyhub.com' })
      expect(result.email).toBe('a***@studyhub.com')
    })

    it('handles arrays', () => {
      const input = [{ password: 'x' }, { name: 'alice' }]
      const result = redactObject(input)
      expect(result[0].password).toBe(REDACTED)
      expect(result[1].name).toBe('alice')
    })

    it('handles null and undefined', () => {
      expect(redactObject(null)).toBeNull()
      expect(redactObject(undefined)).toBeUndefined()
    })

    it('handles primitives', () => {
      expect(redactObject('hello')).toBe('hello')
      expect(redactObject(42)).toBe(42)
    })

    it('redacts Buffers', () => {
      expect(redactObject(Buffer.from('secret'))).toBe(REDACTED)
    })

    it('redacts Uint8Arrays', () => {
      expect(redactObject(new Uint8Array([1, 2, 3]))).toBe(REDACTED)
    })

    it('does not mutate the original object', () => {
      const input = { password: 'secret', email: 'a@b.com' }
      redactObject(input)
      expect(input.password).toBe('secret')
      expect(input.email).toBe('a@b.com')
    })

    it('handles deeply nested structures with depth limit', () => {
      let deep = { value: 'ok' }
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep }
      }
      const result = redactObject(deep)
      // Should not throw, deep parts become REDACTED
      expect(result).toBeDefined()
    })
  })

  describe('redactHeaders', () => {
    it('redacts cookie header', () => {
      const headers = { cookie: 'session=abc123', 'content-type': 'application/json' }
      const result = redactHeaders(headers)
      expect(result.cookie).toBe(REDACTED)
      expect(result['content-type']).toBe('application/json')
    })

    it('redacts authorization header', () => {
      const result = redactHeaders({ Authorization: 'Bearer token123' })
      expect(result.Authorization).toBe(REDACTED)
    })

    it('redacts set-cookie header', () => {
      const result = redactHeaders({ 'Set-Cookie': 'session=xyz; HttpOnly' })
      expect(result['Set-Cookie']).toBe(REDACTED)
    })

    it('redacts x-csrf-token', () => {
      const result = redactHeaders({ 'X-CSRF-Token': 'abc' })
      expect(result['X-CSRF-Token']).toBe(REDACTED)
    })

    it('handles null/undefined headers', () => {
      expect(redactHeaders(null)).toEqual({})
      expect(redactHeaders(undefined)).toEqual({})
    })
  })

  describe('safeRequestContext', () => {
    it('extracts safe fields from a request-like object', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/auth/login',
        ip: '127.0.0.1',
        get: (h) => h === 'user-agent' ? 'TestAgent/1.0' : undefined,
        user: { id: 42 },
        body: { password: 'SHOULD_NOT_APPEAR' },
        headers: { cookie: 'SHOULD_NOT_APPEAR' },
      }
      const ctx = safeRequestContext(req)
      expect(ctx).toEqual({
        method: 'POST',
        url: '/api/auth/login',
        ip: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        userId: 42,
      })
      expect(ctx.body).toBeUndefined()
      expect(ctx.headers).toBeUndefined()
      expect(ctx.password).toBeUndefined()
    })

    it('handles null request', () => {
      expect(safeRequestContext(null)).toEqual({})
    })

    it('handles unauthenticated request', () => {
      const req = { method: 'GET', originalUrl: '/api/sheets', get: () => undefined }
      const ctx = safeRequestContext(req)
      expect(ctx.userId).toBeNull()
    })
  })
})
