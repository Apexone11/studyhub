/**
 * recoveryCodes.unit.test.js — security primitives behind 2FA recovery codes.
 *
 * Coverage focuses on the contract the login-recovery and settings-
 * regenerate routes depend on:
 *
 *   - 10 codes per batch, each `xxxxx-xxxxx` lowercase hex.
 *   - hashCodes returns one bcrypt hash per plaintext, none identical.
 *   - normalizeRecoveryCode accepts both formatted and dash-stripped
 *     inputs and rejects garbage.
 *   - consumeRecoveryCode roundtrip: plaintext → hash → consume.
 *   - Same code cannot be consumed twice (the canonical "burn once"
 *     property — without it, a stolen code would be reusable until
 *     the user regenerates).
 *   - consumeRecoveryCode iterates ALL hashes even after a match so
 *     timing analysis can't infer match position.
 *
 * Plan reference: docs/internal/archive/audits/2026-05-achievements/
 * 2026-04-30-2fa-recovery-codes-plan.md §"Tests required before shipping"
 * — closes the unit-test gap (wave-12.8.1).
 */
import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  RECOVERY_CODE_COUNT,
  generatePlaintextCodes,
  hashCodes,
  normalizeRecoveryCode,
  consumeRecoveryCode,
} = require('../src/lib/auth/recoveryCodes')

describe('generatePlaintextCodes', () => {
  it('returns the documented number of codes', () => {
    const codes = generatePlaintextCodes()
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(RECOVERY_CODE_COUNT).toBe(10)
  })

  it('every code matches the canonical xxxxx-xxxxx hex pattern', () => {
    const codes = generatePlaintextCodes()
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/)
    }
  })

  it('two batches produce different codes (randomness sanity)', () => {
    const a = generatePlaintextCodes()
    const b = generatePlaintextCodes()
    const overlap = a.filter((code) => b.includes(code))
    expect(overlap).toHaveLength(0)
  })
})

describe('hashCodes', () => {
  it('returns one bcrypt hash per input code', async () => {
    const plaintext = ['aaaaa-bbbbb', 'ccccc-ddddd', 'eeeee-fffff']
    const hashes = await hashCodes(plaintext)
    expect(hashes).toHaveLength(3)
    for (const h of hashes) {
      // bcrypt header — $2a$, $2b$, or $2y$ depending on version.
      expect(h).toMatch(/^\$2[aby]\$/)
    }
  })

  it('produces distinct hashes for distinct inputs (per-code salt)', async () => {
    const hashes = await hashCodes(['aaaaa-bbbbb', 'aaaaa-bbbbb'])
    expect(hashes[0]).not.toBe(hashes[1])
  })

  it('every hash verifies against its plaintext via bcrypt.compare', async () => {
    const plaintext = generatePlaintextCodes()
    const hashes = await hashCodes(plaintext)
    for (let i = 0; i < plaintext.length; i += 1) {
      const ok = await bcrypt.compare(plaintext[i], hashes[i])
      expect(ok).toBe(true)
    }
  })
})

describe('normalizeRecoveryCode', () => {
  it('passes through the canonical form', () => {
    expect(normalizeRecoveryCode('abc12-def34')).toBe('abc12-def34')
  })

  it('upper-cases are folded to lower', () => {
    expect(normalizeRecoveryCode('ABC12-DEF34')).toBe('abc12-def34')
  })

  it('whitespace inside or around is stripped', () => {
    expect(normalizeRecoveryCode('  abc12 - def34  ')).toBe('abc12-def34')
    expect(normalizeRecoveryCode('abc 12-de f34')).toBe('abc12-def34')
  })

  it('no-dash form is normalized back to canonical', () => {
    expect(normalizeRecoveryCode('abc12def34')).toBe('abc12-def34')
  })

  it('rejects non-hex characters', () => {
    expect(normalizeRecoveryCode('abc12-zzzzz')).toBeNull()
    expect(normalizeRecoveryCode('xyz12-def34')).toBeNull()
  })

  it('rejects wrong-length input', () => {
    expect(normalizeRecoveryCode('abc12-def3')).toBeNull() // 9 hex
    expect(normalizeRecoveryCode('abc12-def345')).toBeNull() // 11 hex
  })

  it('rejects non-strings, empty, and nullish', () => {
    expect(normalizeRecoveryCode(null)).toBeNull()
    expect(normalizeRecoveryCode(undefined)).toBeNull()
    expect(normalizeRecoveryCode('')).toBeNull()
    expect(normalizeRecoveryCode('   ')).toBeNull()
    expect(normalizeRecoveryCode(12345)).toBeNull()
    expect(normalizeRecoveryCode({})).toBeNull()
  })
})

describe('consumeRecoveryCode — single-use property', () => {
  it('successfully consumes a valid code and drops its hash from the array', async () => {
    const [first, second, third] = generatePlaintextCodes().slice(0, 3)
    const hashes = await hashCodes([first, second, third])

    const result = await consumeRecoveryCode({ hashes, submitted: second })
    expect(result.matched).toBe(true)
    expect(result.remainingHashes).toHaveLength(2)
    // The matched hash is removed; the other two are preserved.
    const remainingMatch = await Promise.all([
      bcrypt.compare(first, result.remainingHashes[0]),
      bcrypt.compare(third, result.remainingHashes[1]),
    ])
    expect(remainingMatch).toEqual([true, true])
  })

  it('CRITICAL — second consume of the same code FAILS (cannot reuse)', async () => {
    const code = 'abc12-def34'
    const hashes = await hashCodes([code])

    const first = await consumeRecoveryCode({ hashes, submitted: code })
    expect(first.matched).toBe(true)
    expect(first.remainingHashes).toHaveLength(0)

    // Second attempt with the remaining (empty) hash list.
    const second = await consumeRecoveryCode({
      hashes: first.remainingHashes,
      submitted: code,
    })
    expect(second.matched).toBe(false)
    expect(second.remainingHashes).toHaveLength(0)
  })

  it('returns matched=false for an unknown code WITHOUT dropping any hash', async () => {
    const code = 'abc12-def34'
    const hashes = await hashCodes([code, '11111-22222', '33333-44444'])

    const result = await consumeRecoveryCode({ hashes, submitted: '99999-99999' })
    expect(result.matched).toBe(false)
    expect(result.remainingHashes).toBe(hashes)
  })

  it('returns matched=false on empty / null / non-string submission', async () => {
    const hashes = await hashCodes(['abc12-def34'])
    const empty = await consumeRecoveryCode({ hashes, submitted: '' })
    const garbage = await consumeRecoveryCode({ hashes, submitted: 'not-hex' })
    expect(empty.matched).toBe(false)
    expect(garbage.matched).toBe(false)
    // Hashes are NOT mutated — caller persists this back to the row.
    expect(empty.remainingHashes).toEqual(hashes)
    expect(garbage.remainingHashes).toEqual(hashes)
  })

  it('returns matched=false on empty hashes array (no codes generated yet)', async () => {
    const result = await consumeRecoveryCode({ hashes: [], submitted: 'abc12-def34' })
    expect(result.matched).toBe(false)
    expect(result.remainingHashes).toEqual([])
  })

  it('accepts the no-dash form too (xxxxxxxxxx ≡ xxxxx-xxxxx)', async () => {
    const canonical = 'abc12-def34'
    const noDash = 'abc12def34'
    const hashes = await hashCodes([canonical])
    const result = await consumeRecoveryCode({ hashes, submitted: noDash })
    expect(result.matched).toBe(true)
  })

  it('matching an early-index hash still returns ALL non-matching hashes', async () => {
    // The function must iterate every position regardless of where the
    // match occurs (no early break) so attackers can't infer position
    // from response timing. We verify the *outcome*: a match at index 0
    // returns the other 9 untouched. If the function broke early on
    // match it would also work — but it would still need to drop the
    // matched index, so the outcome is the same. The structural
    // no-early-break guarantee is enforced at code-review time.
    const codes = generatePlaintextCodes()
    const hashes = await hashCodes(codes)

    const result = await consumeRecoveryCode({ hashes, submitted: codes[0] })
    expect(result.matched).toBe(true)
    expect(result.remainingHashes).toHaveLength(hashes.length - 1)
    expect(result.remainingHashes).not.toContain(hashes[0])
  }, 20_000)
})
