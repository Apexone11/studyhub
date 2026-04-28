import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'

const require = createRequire(import.meta.url)
const { persistedIp } = require('../src/modules/creatorAudit/creatorAudit.controller')

function req(headers = {}) {
  return {
    ip: '203.0.113.10',
    get(name) {
      return headers[String(name).toLowerCase()]
    },
  }
}

describe('persistedIp', () => {
  it('stores raw IP outside EU jurisdictions', () => {
    expect(persistedIp(req({ 'cf-ipcountry': 'US' }))).toBe('203.0.113.10')
  })

  it('hashes IP for EU jurisdictions', () => {
    expect(persistedIp(req({ 'cf-ipcountry': 'DE' }))).toBe(
      crypto.createHash('sha256').update('203.0.113.10').digest('hex'),
    )
  })

  it('prefers the first forwarded IP', () => {
    expect(persistedIp(req({ 'x-forwarded-for': '198.51.100.2, 203.0.113.10' }))).toBe(
      '198.51.100.2',
    )
  })
})
