import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Anchor the path to THIS file's location so the test passes regardless of
// the cwd vitest is launched from (root, workspace, monorepo runner, etc.).
const here = dirname(fileURLToPath(import.meta.url))
const headersPath = join(here, '..', '..', 'public', '_headers')

function readFrontendCsp() {
  const headers = readFileSync(headersPath, 'utf8')
  const match = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)
  return match?.[1] || ''
}

function directiveValue(csp, directiveName) {
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
