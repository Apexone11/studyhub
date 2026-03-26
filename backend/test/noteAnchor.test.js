import { describe, expect, it } from 'vitest'
import { buildAnchorContext, validateAnchorInput, CONTEXT_CHARS } from '../src/lib/noteAnchor.js'

describe('noteAnchor', () => {
  describe('buildAnchorContext', () => {
    const content = 'The quick brown fox jumps over the lazy dog. The fox ran home quickly after that.'

    it('returns prefix and suffix around the anchor text', () => {
      const result = buildAnchorContext(content, 'brown fox', 10)
      expect(result).toBeTruthy()
      const ctx = JSON.parse(result)
      expect(ctx.prefix).toBeDefined()
      expect(ctx.suffix).toBeDefined()
      expect(content.includes(ctx.prefix + 'brown fox')).toBe(true)
      expect(content.includes('brown fox' + ctx.suffix)).toBe(true)
    })

    it('returns null when anchor text is not in content', () => {
      const result = buildAnchorContext(content, 'nonexistent phrase', 0)
      expect(result).toBeNull()
    })

    it('returns null when inputs are missing', () => {
      expect(buildAnchorContext(null, 'test', 0)).toBeNull()
      expect(buildAnchorContext(content, null, 0)).toBeNull()
      expect(buildAnchorContext(content, 'test', null)).toBeNull()
    })

    it('limits context to CONTEXT_CHARS', () => {
      const longContent = 'A'.repeat(200) + 'TARGET' + 'B'.repeat(200)
      const result = buildAnchorContext(longContent, 'TARGET', 200)
      const ctx = JSON.parse(result)
      expect(ctx.prefix.length).toBeLessThanOrEqual(CONTEXT_CHARS)
      expect(ctx.suffix.length).toBeLessThanOrEqual(CONTEXT_CHARS)
    })

    it('handles anchor at the start of content', () => {
      const result = buildAnchorContext(content, 'The quick', 0)
      const ctx = JSON.parse(result)
      expect(ctx.prefix).toBe('')
      expect(ctx.suffix.length).toBeGreaterThan(0)
    })

    it('handles anchor at the end of content', () => {
      const idx = content.indexOf('after that.')
      const result = buildAnchorContext(content, 'after that.', idx)
      const ctx = JSON.parse(result)
      expect(ctx.suffix).toBe('')
      expect(ctx.prefix.length).toBeGreaterThan(0)
    })

    it('fuzzy-matches offset within ±10 chars', () => {
      // Offset is slightly off but the text is nearby
      const result = buildAnchorContext(content, 'brown fox', 5)
      expect(result).toBeTruthy()
    })
  })

  describe('validateAnchorInput', () => {
    it('returns sanitized anchor for valid input', () => {
      const result = validateAnchorInput({ anchorText: '  selected text  ', anchorOffset: 42 })
      expect(result).toEqual({ anchorText: 'selected text', anchorOffset: 42 })
    })

    it('returns null for empty anchorText', () => {
      expect(validateAnchorInput({ anchorText: '', anchorOffset: 0 })).toBeNull()
      expect(validateAnchorInput({ anchorText: '   ', anchorOffset: 0 })).toBeNull()
    })

    it('returns null when anchorText is not a string', () => {
      expect(validateAnchorInput({ anchorText: 123, anchorOffset: 0 })).toBeNull()
      expect(validateAnchorInput({})).toBeNull()
    })

    it('truncates anchorText to 500 chars', () => {
      const longText = 'a'.repeat(600)
      const result = validateAnchorInput({ anchorText: longText, anchorOffset: 0 })
      expect(result.anchorText.length).toBeLessThanOrEqual(500)
    })

    it('returns null anchorOffset for negative values', () => {
      const result = validateAnchorInput({ anchorText: 'test', anchorOffset: -5 })
      expect(result.anchorOffset).toBeNull()
    })

    it('returns null anchorOffset for non-integer values', () => {
      const result = validateAnchorInput({ anchorText: 'test', anchorOffset: 3.14 })
      expect(result.anchorOffset).toBeNull()
    })

    it('returns null anchorOffset when not a number', () => {
      const result = validateAnchorInput({ anchorText: 'test', anchorOffset: 'abc' })
      expect(result.anchorOffset).toBeNull()
    })
  })
})
