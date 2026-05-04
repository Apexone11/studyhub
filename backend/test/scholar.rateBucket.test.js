/**
 * scholar.rateBucket.test.js — Per-source token-bucket coverage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const rateBucket = require('../src/modules/scholar/rateBucket')

describe('scholar/rateBucket', () => {
  afterEach(() => {
    rateBucket._resetForTests()
    vi.useRealTimers()
  })

  it('allows take() up to capacity then throttles', () => {
    // arxiv has burst=1; semanticScholar has burst=5.
    expect(rateBucket.take('semanticScholar')).toBe(true)
    expect(rateBucket.take('semanticScholar')).toBe(true)
    expect(rateBucket.take('semanticScholar')).toBe(true)
    expect(rateBucket.take('semanticScholar')).toBe(true)
    expect(rateBucket.take('semanticScholar')).toBe(true)
    expect(rateBucket.take('semanticScholar')).toBe(false)
  })

  it('arxiv has burst of 1 and refills slowly (3s)', () => {
    vi.useFakeTimers()
    rateBucket._resetForTests()
    expect(rateBucket.take('arxiv')).toBe(true)
    expect(rateBucket.take('arxiv')).toBe(false)
    vi.setSystemTime(new Date(Date.now() + 1500))
    // Half a refill — still empty.
    expect(rateBucket.take('arxiv')).toBe(false)
    vi.setSystemTime(new Date(Date.now() + 1600))
    // Total 3.1s elapsed → bucket has refilled to ≥ 1.
    expect(rateBucket.take('arxiv')).toBe(true)
  })

  it('inspect() reports remaining tokens', () => {
    rateBucket._resetForTests()
    rateBucket.take('crossref')
    const r = rateBucket.inspect('crossref')
    expect(r.source).toBe('crossref')
    expect(r.tokens).toBeGreaterThan(0)
    expect(r.capacity).toBe(100)
  })

  it('throws on unknown source', () => {
    expect(() => rateBucket.take('not-a-source')).toThrow(/Unknown rateBucket source/)
  })
})
