import { describe, it, expect } from 'vitest'
import { sanitizePastedHtml } from './notePaste.js'

describe('sanitizePastedHtml', () => {
  it('strips Office namespaces', () => {
    const out = sanitizePastedHtml('<p><o:p>foo</o:p></p>')
    expect(out).not.toMatch(/o:p/i)
  })

  it('preserves semantic tags', () => {
    const html = '<p><strong>bold</strong> <em>i</em> <a href="https://x.y">link</a></p>'
    const out = sanitizePastedHtml(html)
    expect(out).toContain('<strong>')
    expect(out).toMatch(/href="https:\/\/x\.y"/)
  })

  it('drops inline styles and class attributes', () => {
    const out = sanitizePastedHtml('<p class="m1" style="color:red">x</p>')
    expect(out).not.toMatch(/class=/)
    expect(out).not.toMatch(/style=/)
  })

  it('drops scripts and style tags', () => {
    const out = sanitizePastedHtml('<p>hi</p><script>alert(1)</script><style>.a{}</style>')
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/<style/i)
  })

  it('preserves tables', () => {
    const html = '<table><tbody><tr><td>1</td></tr></tbody></table>'
    expect(sanitizePastedHtml(html)).toContain('<table>')
  })

  it('rewrites anchors with rel and target attributes', () => {
    const out = sanitizePastedHtml('<a href="https://example.com">x</a>')
    expect(out).toMatch(/rel="noopener noreferrer"/)
    expect(out).toMatch(/target="_blank"/)
  })

  it('returns empty string for nullish input', () => {
    expect(sanitizePastedHtml(null)).toBe('')
    expect(sanitizePastedHtml(undefined)).toBe('')
  })

  it('strips data: URIs in img src', () => {
    const out = sanitizePastedHtml(
      '<img src="data:text/html;base64,PHNjcmlwdD4xPC9zY3JpcHQ+" alt="x">',
    )
    expect(out).not.toMatch(/data:/)
  })

  it('preserves https img src', () => {
    const out = sanitizePastedHtml('<img src="https://x.y/z.png" alt="z">')
    expect(out).toContain('src="https://x.y/z.png"')
  })
})
