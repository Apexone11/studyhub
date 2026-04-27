/**
 * extractPreviewText.test.js
 *
 * Pins the contract the StudySheet.previewText column relies on:
 * extract a clean, capped, NULL-safe summary from a raw HTML/markdown
 * sheet body. Wired into sheets.create + sheets.update controllers and
 * the backfillPreviewText script — drift here means stale Grid cards.
 */

import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const { extractPreviewText, PREVIEW_MAX_CHARS } = require('../src/lib/sheets/extractPreviewText')

describe('extractPreviewText', () => {
  it('strips simple HTML tags and joins paragraphs with a space', () => {
    const out = extractPreviewText('<p>Hello world</p><p>More content</p>')
    expect(out).toBe('Hello world More content')
  })

  it('strips embedded <style> and <script> blocks', () => {
    const out = extractPreviewText(
      '<style>.x{color:red}</style><p>Visible</p><script>alert(1)</script>',
    )
    expect(out).toBe('Visible')
    expect(out).not.toContain('color:red')
    expect(out).not.toContain('alert')
  })

  it('decodes the common HTML entities', () => {
    const out = extractPreviewText('Tom &amp; Jerry &lt;3 &quot;hi&quot;')
    expect(out).toBe(`Tom & Jerry <3 "hi"`)
  })

  it('strips common markdown markers so previews stay readable', () => {
    const out = extractPreviewText('**bold** # Heading [docs](https://example.com)\n- item one')
    expect(out).toBe('bold Heading docs item one')
  })

  it('collapses runs of whitespace including newlines and tabs', () => {
    const out = extractPreviewText('a\n\n\tb   c\n\nd')
    expect(out).toBe('a b c d')
  })

  it('truncates content longer than the cap with an ellipsis', () => {
    const long = 'x'.repeat(500)
    const out = extractPreviewText(long)
    expect(out).toHaveLength(PREVIEW_MAX_CHARS)
    expect(out.endsWith('...')).toBe(true)
  })

  it('does NOT add an ellipsis when content is exactly at the cap', () => {
    const exact = 'y'.repeat(PREVIEW_MAX_CHARS)
    const out = extractPreviewText(exact)
    expect(out).toBe(exact)
    expect(out.endsWith('...')).toBe(false)
  })

  it('returns null for empty / whitespace-only / non-string input', () => {
    expect(extractPreviewText('')).toBeNull()
    expect(extractPreviewText('   \n\t  ')).toBeNull()
    expect(extractPreviewText(null)).toBeNull()
    expect(extractPreviewText(undefined)).toBeNull()
    expect(extractPreviewText(42)).toBeNull()
    expect(extractPreviewText({})).toBeNull()
  })

  it('returns null for HTML that contains no rendered text', () => {
    expect(extractPreviewText('<style>.x{color:red}</style>')).toBeNull()
    expect(extractPreviewText('<script>let x=1</script>')).toBeNull()
    expect(extractPreviewText('<div></div>')).toBeNull()
  })

  it('avoids leaving a dangling high surrogate when truncating emoji text', () => {
    const long = `${'x'.repeat(236)}😀tail`
    const out = extractPreviewText(long)
    expect(out.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS)
    expect(out.endsWith('...')).toBe(true)
    expect(/[\uD800-\uDBFF]$/.test(out.slice(0, -3))).toBe(false)
  })
})
