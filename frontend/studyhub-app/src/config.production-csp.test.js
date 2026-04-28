/* eslint-disable no-undef */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

describe('production CSP', () => {
  it('allows the production API origin for iframe previews', () => {
    const cspLine = headers
      .split('\n')
      .find((line) => line.trim().startsWith('Content-Security-Policy:'))

    expect(cspLine).toContain('connect-src')
    expect(cspLine).toContain('https://api.getstudyhub.org')
    expect(cspLine).toContain('frame-src')
    expect(cspLine).toMatch(/frame-src[^;]*https:\/\/api\.getstudyhub\.org/)
  })
})
