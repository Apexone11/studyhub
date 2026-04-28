import { describe, expect, it } from 'vitest'
import { resolveImageUrl, safeImageSrc } from './imageUrls'

describe('safeImageSrc', () => {
  it('allows https images', () => {
    expect(safeImageSrc('https://cdn.getstudyhub.org/avatar.png')).toBe(
      'https://cdn.getstudyhub.org/avatar.png',
    )
  })

  it('upgrades public http image URLs to https to avoid mixed-content breakage', () => {
    expect(safeImageSrc('http://api.getstudyhub.org/uploads/avatars/a.png')).toBe(
      'https://api.getstudyhub.org/uploads/avatars/a.png',
    )
  })

  it('keeps localhost http URLs for local development', () => {
    expect(safeImageSrc('http://localhost:4000/uploads/avatars/a.png')).toBe(
      'http://localhost:4000/uploads/avatars/a.png',
    )
  })

  it('allows relative, blob, protocol-relative, and image data URLs', () => {
    expect(safeImageSrc('/uploads/avatars/a.png')).toBe('/uploads/avatars/a.png')
    expect(safeImageSrc('//lh3.googleusercontent.com/a.png')).toBe(
      '//lh3.googleusercontent.com/a.png',
    )
    expect(safeImageSrc('blob:http://localhost:5173/a')).toBe('blob:http://localhost:5173/a')
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })

  it('rejects scriptable or local-file URLs', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeNull()
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeImageSrc('file:///C:/Users/secret.png')).toBeNull()
  })
})

describe('resolveImageUrl', () => {
  it('resolves managed upload paths through the API origin', () => {
    expect(resolveImageUrl('/uploads/avatars/u.png', 'https://api.getstudyhub.org')).toBe(
      'https://api.getstudyhub.org/uploads/avatars/u.png',
    )
  })

  it('does not double-prefix absolute image URLs', () => {
    expect(resolveImageUrl('https://images.example.com/u.png', 'https://api.getstudyhub.org')).toBe(
      'https://images.example.com/u.png',
    )
  })

  it('returns null for invalid image URLs', () => {
    expect(resolveImageUrl('not a url', 'https://api.getstudyhub.org')).toBeNull()
  })
})
