import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  auditAssetOrigins,
  classifyOrigin,
  extractExternalUrls,
} = require('../src/lib/assetOriginPolicy')

describe('classifyOrigin', () => {
  afterEach(() => {
    delete process.env.FRONTEND_URL
    delete process.env.API_URL
    delete process.env.STUDYHUB_ASSET_CDN
  })

  it('allows configured same-origin hosts', () => {
    process.env.FRONTEND_URL = 'https://getstudyhub.org'

    expect(classifyOrigin('https://getstudyhub.org/uploads/avatars/a.png')).toMatchObject({
      tier: 'allowed',
      deduction: 0,
    })
  })

  it('classifies safe providers with a small deduction', () => {
    expect(classifyOrigin('https://fonts.googleapis.com/css2?family=Inter')).toMatchObject({
      tier: 'safe',
      deduction: 5,
    })
  })

  it('classifies unknown HTTPS origins without throwing', () => {
    expect(classifyOrigin('https://cdn.example.edu/image.png')).toMatchObject({
      tier: 'unknown',
      deduction: 15,
    })
  })

  it('blocks known tracker or malware origins', () => {
    expect(classifyOrigin('https://stats.doubleclick.net/pixel.gif')).toMatchObject({
      tier: 'blocked',
      deduction: 50,
    })
  })

  it('returns null for malformed and non-http URLs', () => {
    expect(classifyOrigin('not a url')).toBeNull()
    expect(classifyOrigin('javascript:alert(1)')).toBeNull()
  })
})

describe('auditAssetOrigins', () => {
  it('extracts src, href, css url(), and @import URLs', () => {
    const urls = extractExternalUrls(`
      <img src="https://cdn.example.edu/a.png">
      <a href="https://getstudyhub.org/sheets/1">sheet</a>
      <style>.x { background-image: url('https://doubleclick.net/p.gif'); } @import "https://fonts.googleapis.com/css2";</style>
    `)

    expect(urls).toEqual(
      expect.arrayContaining([
        'https://cdn.example.edu/a.png',
        'https://getstudyhub.org/sheets/1',
        'https://doubleclick.net/p.gif',
        'https://fonts.googleapis.com/css2',
      ]),
    )
  })

  it('returns findings for unknown and blocked origins only', () => {
    const result = auditAssetOrigins(`
      <img src="https://cdn.example.edu/a.png">
      <img src="https://doubleclick.net/p.gif">
      <link href="https://fonts.googleapis.com/css2" rel="stylesheet">
    `)

    expect(result.findings.map((finding) => finding.tier)).toEqual(['unknown', 'blocked'])
    expect(result.score).toBe(30)
  })
})
