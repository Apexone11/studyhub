/**
 * applyContentUpdate.test.js
 *
 * Pins the contract that every sheet write site relies on for keeping
 * the Sheets Grid card preview in sync with the actual content. The
 * helper is intentionally tiny — but four call sites (create, update,
 * contribution-merge, sheet-lab restore + sync, fork creation) thread
 * through it, so any drift here ripples into stale Grid cards across
 * the product.
 */

import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const { withPreviewText } = require('../src/lib/sheets/applyContentUpdate')
const { extractPreviewText } = require('../src/lib/sheets/extractPreviewText')

describe('withPreviewText', () => {
  it('returns the same content unchanged for spreading into Prisma data', () => {
    const out = withPreviewText('<p>Hello world</p>')
    expect(out.content).toBe('<p>Hello world</p>')
  })

  it('derives previewText from the same content the row will hold', () => {
    const html = '<p>Visible text</p><p>More visible text</p>'
    const out = withPreviewText(html)
    expect(out.previewText).toBe(extractPreviewText(html))
  })

  it('returns previewText null for empty content (matches DB NULL contract)', () => {
    expect(withPreviewText('').previewText).toBeNull()
  })

  it('returns previewText null for whitespace-only content', () => {
    expect(withPreviewText('   \n\t  ').previewText).toBeNull()
  })

  it('returns previewText null for non-string input', () => {
    expect(withPreviewText(null).previewText).toBeNull()
    expect(withPreviewText(undefined).previewText).toBeNull()
  })

  it('strips HTML tags from previewText so the Grid card renders plain text', () => {
    const out = withPreviewText('<p>Visible <strong>bold</strong> text</p>')
    expect(out.previewText).not.toContain('<')
    expect(out.previewText).toContain('Visible')
    expect(out.previewText).toContain('bold')
  })

  it('truncates at the documented PREVIEW_MAX_CHARS cap', () => {
    const long = 'word '.repeat(200) // 1000 chars
    const out = withPreviewText(long)
    expect(out.previewText).not.toBeNull()
    expect(out.previewText.length).toBeLessThanOrEqual(240)
  })

  it('returns a fresh object each call (does not mutate or memoize)', () => {
    const a = withPreviewText('<p>A</p>')
    const b = withPreviewText('<p>A</p>')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('produces a spread shape ready for Prisma data: { content, previewText }', () => {
    const out = withPreviewText('<p>Test</p>')
    expect(Object.keys(out).sort()).toEqual(['content', 'previewText'])
  })

  it('keeps content + previewText in lock-step across two different inputs', () => {
    const first = withPreviewText('<p>Initial</p>')
    const second = withPreviewText('<p>Updated body</p>')
    expect(first.content).not.toBe(second.content)
    expect(first.previewText).not.toBe(second.previewText)
    // The previewText for second matches the extractor on second's content,
    // not on first's content — i.e., no carry-over from a prior call.
    expect(second.previewText).toBe(extractPreviewText(second.content))
  })
})
