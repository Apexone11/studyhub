import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { lintHtml } = require('../src/lib/accessibilityLint')

function ruleIds(html) {
  return lintHtml(html).failures.map((failure) => failure.ruleId)
}

describe('lintHtml', () => {
  it('passes a basic accessible sheet fragment', () => {
    expect(
      lintHtml(`
        <h1>Study Guide</h1>
        <h2>Key ideas</h2>
        <img src="/diagram.png" alt="Mitosis diagram">
        <a href="/sources">Sources</a>
        <label for="answer">Answer</label><input id="answer">
      `).failures,
    ).toEqual([])
  })

  it('flags images missing alt text', () => {
    expect(ruleIds('<img src="/diagram.png">')).toContain('image-alt')
  })

  it('flags skipped heading levels', () => {
    expect(ruleIds('<h1>One</h1><h3>Three</h3>')).toContain('heading-order')
  })

  it('flags links without accessible names', () => {
    expect(ruleIds('<a href="/x"><span></span></a>')).toContain('link-name')
  })

  it('flags form controls without labels', () => {
    expect(ruleIds('<input type="text" name="answer">')).toContain('label')
  })

  it('flags obvious same-color contrast failures', () => {
    expect(ruleIds('<p style="color: #fff; background: #fff">Hidden</p>')).toContain(
      'color-contrast',
    )
  })
})
