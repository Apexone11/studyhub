import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  detectCopyrightSignals,
  stripAttributionContainers,
} = require('../src/lib/copyrightSignals')

describe('detectCopyrightSignals', () => {
  it('detects stock-provider text and image hosts', () => {
    const result = detectCopyrightSignals(`
      <p>Image via Getty Images. All rights reserved.</p>
      <img src="https://media.shutterstock.com/photo.jpg">
    `)

    expect(result.signals.length).toBeGreaterThanOrEqual(3)
    expect(result.scoreDeduction).toBeGreaterThan(0)
  })

  it('excludes copyright text inside attribution containers', () => {
    const result = detectCopyrightSignals(
      '<footer>© 2026 Professor Example</footer><p>Lecture notes</p>',
    )

    expect(result.signals).toEqual([])
  })

  it('detects weak watermark filename signals', () => {
    const result = detectCopyrightSignals('<img src="https://example.com/sample_image.jpg">')

    expect(result.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'filename', strength: 'weak' })]),
    )
  })
})

describe('stripAttributionContainers', () => {
  it('removes footer and aside blocks before text matching', () => {
    expect(stripAttributionContainers('<aside>© 2026</aside><p>Body</p>')).not.toContain('2026')
  })
})
