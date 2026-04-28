import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { computePriorityScore } = require('../src/modules/creatorAudit/reachPriority')

describe('computePriorityScore', () => {
  it('increases with severity and reach', () => {
    const low = computePriorityScore({
      findingSeverity: 1,
      followerCount: 10,
      avgViewsPerSheet: 10,
      hoursSinceFlagged: 1,
    })
    const high = computePriorityScore({
      findingSeverity: 5,
      followerCount: 1000,
      avgViewsPerSheet: 500,
      hoursSinceFlagged: 1,
    })

    expect(high).toBeGreaterThan(low)
  })

  it('decays over time without mutating input', () => {
    const input = {
      findingSeverity: 3,
      followerCount: 200,
      avgViewsPerSheet: 100,
      hoursSinceFlagged: 1,
    }
    const early = computePriorityScore(input)
    const later = computePriorityScore({ ...input, hoursSinceFlagged: 72 })

    expect(later).toBeLessThan(early)
    expect(input.hoursSinceFlagged).toBe(1)
  })
})
