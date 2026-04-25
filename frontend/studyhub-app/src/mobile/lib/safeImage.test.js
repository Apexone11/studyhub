// src/mobile/lib/safeImage.test.js

import { describe, expect, it } from 'vitest'
import { safeImageSrc } from './safeImage'

describe('safeImageSrc', () => {
  it('allows https URLs', () => {
    expect(safeImageSrc('https://studyhub.com/a.png')).toBe('https://studyhub.com/a.png')
  })

  it('allows http URLs', () => {
    expect(safeImageSrc('http://localhost:4000/x.jpg')).toBe('http://localhost:4000/x.jpg')
  })

  it('allows same-origin paths', () => {
    expect(safeImageSrc('/avatars/1.png')).toBe('/avatars/1.png')
  })

  it('allows protocol-relative URLs', () => {
    expect(safeImageSrc('//lh3.googleusercontent.com/abc')).toBe('//lh3.googleusercontent.com/abc')
  })

  it('allows blob: URLs for local previews', () => {
    expect(safeImageSrc('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  it('allows data:image/* URLs', () => {
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })

  it('REJECTS javascript: URIs', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
  })

  it('REJECTS vbscript: URIs', () => {
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeNull()
  })

  it('REJECTS data:text/html', () => {
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('REJECTS file: URIs', () => {
    expect(safeImageSrc('file:///etc/passwd')).toBeNull()
  })

  it('returns null for non-strings', () => {
    expect(safeImageSrc(null)).toBeNull()
    expect(safeImageSrc(undefined)).toBeNull()
    expect(safeImageSrc(42)).toBeNull()
  })

  it('returns null for empty / whitespace', () => {
    expect(safeImageSrc('')).toBeNull()
    expect(safeImageSrc('   ')).toBeNull()
  })

  it('trims leading/trailing whitespace when a URL is valid', () => {
    expect(safeImageSrc('  https://x.com/a.png  ')).toBe('https://x.com/a.png')
  })

  it('is case-insensitive about the javascript: protocol trick', () => {
    expect(safeImageSrc('JAVASCRIPT:alert(1)')).toBeNull()
    expect(safeImageSrc('JaVaScRiPt:alert(1)')).toBeNull()
  })
})
