import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolvePreviewOrigin } = require('../src/modules/sheets/sheets.service')

function mockReq({ protocol = 'http', host = 'api.getstudyhub.org', forwardedProto = '' } = {}) {
  return {
    protocol,
    get(name) {
      const normalized = String(name || '').toLowerCase()
      if (normalized === 'host') return host
      if (normalized === 'x-forwarded-proto') return forwardedProto
      return undefined
    },
  }
}

describe('resolvePreviewOrigin', () => {
  afterEach(() => {
    delete process.env.HTML_PREVIEW_ORIGIN
  })

  it('uses the configured preview origin when valid', () => {
    process.env.HTML_PREVIEW_ORIGIN = 'https://api.getstudyhub.org/ignored-path'

    expect(resolvePreviewOrigin(mockReq())).toBe('https://api.getstudyhub.org')
  })

  it('upgrades configured public http preview origins when the incoming request is https', () => {
    process.env.HTML_PREVIEW_ORIGIN = 'http://api.getstudyhub.org'

    expect(resolvePreviewOrigin(mockReq({ forwardedProto: 'https' }))).toBe(
      'https://api.getstudyhub.org',
    )
  })

  it('honors x-forwarded-proto so HTTPS deployments do not emit mixed-content iframe URLs', () => {
    expect(resolvePreviewOrigin(mockReq({ protocol: 'http', forwardedProto: 'https' }))).toBe(
      'https://api.getstudyhub.org',
    )
  })

  it('uses the first forwarded protocol value when a proxy sends a comma-separated chain', () => {
    expect(resolvePreviewOrigin(mockReq({ forwardedProto: 'https,http' }))).toBe(
      'https://api.getstudyhub.org',
    )
  })

  it('falls back to req.protocol when forwarded protocol is invalid', () => {
    expect(resolvePreviewOrigin(mockReq({ protocol: 'http', forwardedProto: 'javascript' }))).toBe(
      'http://api.getstudyhub.org',
    )
  })

  it('allows Railway preview hosts when no explicit preview origin is configured', () => {
    expect(
      resolvePreviewOrigin(
        mockReq({ host: 'studyhub-backend.up.railway.app', forwardedProto: 'https' }),
      ),
    ).toBe('https://studyhub-backend.up.railway.app')
  })

  it('does not reflect untrusted Host headers into preview URLs', () => {
    expect(
      resolvePreviewOrigin(mockReq({ host: 'attacker.example', forwardedProto: 'https' })),
    ).toBe('https://localhost:4000')
  })

  it('does not reflect malformed Host headers into preview URLs', () => {
    expect(resolvePreviewOrigin(mockReq({ host: 'api.getstudyhub.org@attacker.example' }))).toBe(
      'http://localhost:4000',
    )
  })
})
