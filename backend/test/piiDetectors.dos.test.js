import { describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectPii } = require('../src/lib/piiDetectors')

describe('detectPii ReDoS resistance', () => {
  it('completes pathological 50KB input within budget', () => {
    const pathological = `${'a'.repeat(25000)}@${'b'.repeat(25000)} ${'1 '.repeat(1000)}`
    const startedAt = performance.now()

    const result = detectPii(pathological)
    const elapsedMs = performance.now() - startedAt

    expect(result.findings.length).toBeGreaterThanOrEqual(0)
    expect(elapsedMs).toBeLessThan(100)
  })
})
