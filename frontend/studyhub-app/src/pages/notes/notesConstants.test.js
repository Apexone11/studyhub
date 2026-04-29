import { describe, expect, it, vi } from 'vitest'
import { countWordsFromHtml, wordCount } from './notesConstants'

describe('notesConstants text helpers', () => {
  it('counts plain text words', () => {
    expect(wordCount('  one two\nthree  ')).toBe(3)
    expect(wordCount('')).toBe(0)
  })

  it('extracts words from HTML through an inert DOMParser document', () => {
    const parseSpy = vi.spyOn(DOMParser.prototype, 'parseFromString')

    expect(
      countWordsFromHtml('<article><h1>Exam Prep</h1><p>Chapter two review.</p></article>'),
    ).toBe(5)

    expect(parseSpy).toHaveBeenCalledWith(expect.any(String), 'text/html')
    parseSpy.mockRestore()
  })
})
