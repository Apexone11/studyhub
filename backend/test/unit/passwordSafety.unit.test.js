/**
 * passwordSafety.unit.test.js — pure-function tests for the HIBP
 * k-anonymity check.
 *
 * The function MUST:
 *  - Hash the password with SHA-1 and send ONLY the first 5 hex chars.
 *  - Detect a match on the suffix (case-insensitive UPPER hex).
 *  - Return { breached: true, count } when the suffix appears.
 *  - Return { breached: false, count: 0 } when the suffix is absent.
 *  - Fail-OPEN (return not breached) on network error, timeout, or non-2xx.
 *  - Never send the plaintext or full hash anywhere.
 */
import crypto from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkPasswordBreach } from '../../src/lib/passwordSafety'

const originalFetch = global.fetch

beforeAll(() => {
  global.fetch = vi.fn()
})

afterAll(() => {
  global.fetch = originalFetch
})

beforeEach(() => {
  global.fetch.mockReset()
})

function sha1Upper(input) {
  return crypto.createHash('sha1').update(input).digest('hex').toUpperCase()
}

describe('checkPasswordBreach — fast paths', () => {
  it('returns { breached:false, count:0 } when password is empty string', async () => {
    const result = await checkPasswordBreach('')
    expect(result).toEqual({ breached: false, count: 0 })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns { breached:false, count:0 } when password is null/undefined', async () => {
    expect(await checkPasswordBreach(null)).toEqual({ breached: false, count: 0 })
    expect(await checkPasswordBreach(undefined)).toEqual({ breached: false, count: 0 })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns { breached:false, count:0 } when password is a non-string (e.g. number)', async () => {
    // The early type-guard treats anything that's not a string as a fast no-op.
    expect(await checkPasswordBreach(12345)).toEqual({ breached: false, count: 0 })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('checkPasswordBreach — k-anonymity request shape', () => {
  it('only sends the first 5 chars of SHA-1 (k-anonymity guarantee)', async () => {
    const password = 'CorrectHorseBatteryStaple1'
    const full = sha1Upper(password)
    const prefix = full.slice(0, 5)
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '0000000000000000000000000000000000:7\n',
    })
    await checkPasswordBreach(password)
    const url = global.fetch.mock.calls[0][0]
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`)
    // The full hash (everything after the first 5) MUST NOT appear in the URL.
    expect(url).not.toContain(full)
    expect(url).not.toContain(full.slice(5))
    // The plaintext password MUST NEVER be in the URL.
    expect(url).not.toContain(password)
  })

  it('sets the Add-Padding: true header so HIBP returns a padded response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '',
    })
    await checkPasswordBreach('Password123')
    const opts = global.fetch.mock.calls[0][1]
    expect(opts.headers['Add-Padding']).toBe('true')
    expect(opts.headers['User-Agent']).toMatch(/StudyHub/i)
  })
})

describe('checkPasswordBreach — match detection', () => {
  it('returns breached:true with the parsed count when the suffix is present', async () => {
    const password = 'leaked-password'
    const full = sha1Upper(password)
    const suffix = full.slice(5)
    // The HIBP body is "SUFFIX:COUNT\n" repeated; we put the real suffix on a line.
    const body = `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\n${suffix}:8675309\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:3\n`
    global.fetch.mockResolvedValueOnce({ ok: true, text: async () => body })
    const result = await checkPasswordBreach(password)
    expect(result).toEqual({ breached: true, count: 8675309 })
  })

  it('returns breached:false when the suffix is absent from the response', async () => {
    const password = 'unique-passphrase-3.14159'
    const body = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:3\n'
    global.fetch.mockResolvedValueOnce({ ok: true, text: async () => body })
    const result = await checkPasswordBreach(password)
    expect(result).toEqual({ breached: false, count: 0 })
  })
})

describe('checkPasswordBreach — fail-OPEN on outage', () => {
  it('returns breached:false when fetch rejects (network error)', async () => {
    global.fetch.mockRejectedValueOnce(new Error('ECONNRESET'))
    const result = await checkPasswordBreach('Password123')
    expect(result).toEqual({ breached: false, count: 0 })
  })

  it('returns breached:false when HIBP returns non-2xx', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 502, text: async () => '' })
    const result = await checkPasswordBreach('Password123')
    expect(result).toEqual({ breached: false, count: 0 })
  })

  it('returns breached:false on AbortController timeout (fetch throws AbortError)', async () => {
    // Simulate the AbortController firing — fetch throws and the function
    // must return gracefully so users aren't blocked by a slow HIBP.
    global.fetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const result = await checkPasswordBreach('Password123')
    expect(result).toEqual({ breached: false, count: 0 })
  })
})
