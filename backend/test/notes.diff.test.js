import { describe, it, expect } from 'vitest'
import { buildWordDiff } from '../src/modules/notes/notes.diff.js'

describe('buildWordDiff', () => {
  it('returns add chunk and positive added count for inserted words', () => {
    const { chunks, summary } = buildWordDiff('hello world', 'hello brave world')
    expect(chunks.some((c) => c.type === 'add')).toBe(true)
    expect(summary.added).toBeGreaterThan(0)
    expect(summary.removed).toBe(0)
  })

  it('handles empty-to-full', () => {
    const { chunks, summary } = buildWordDiff('', 'brand new note')
    expect(summary.added).toBe(3)
    expect(summary.removed).toBe(0)
    expect(chunks.find((c) => c.type === 'add')).toBeTruthy()
  })

  it('handles full-to-empty', () => {
    const { summary } = buildWordDiff('was here', '')
    expect(summary.added).toBe(0)
    expect(summary.removed).toBe(2)
  })

  it('returns all-equal chunks for identical text', () => {
    const { chunks, summary } = buildWordDiff('same', 'same')
    expect(summary.added).toBe(0)
    expect(summary.removed).toBe(0)
    expect(chunks.every((c) => c.type === 'equal')).toBe(true)
  })

  it('handles null/undefined inputs as empty', () => {
    expect(buildWordDiff(null, null).summary).toEqual({ added: 0, removed: 0 })
    expect(buildWordDiff(undefined, 'hi').summary.added).toBe(1)
  })
})
