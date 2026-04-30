/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const headersPath = join(process.cwd(), 'public', '_headers')

function readFrontendCsp(): string {
  const headers = readFileSync(headersPath, 'utf8')
  const match = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)
  return match?.[1] || ''
}

function directiveValue(csp: string, directiveName: string): string {
  const directive = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directiveName} `))

  return directive || ''
}

describe('static frontend security headers', () => {
  it('allows isolated HTML sheet preview frames from branded preview origins', () => {
    const frameSrc = directiveValue(readFrontendCsp(), 'frame-src')

    expect(frameSrc).toContain('https://api.getstudyhub.org')
    expect(frameSrc).toContain('https://sheets.getstudyhub.org')
  })
})