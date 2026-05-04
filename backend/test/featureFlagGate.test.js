/**
 * featureFlagGate.test.js — fail-closed semantics for L20-CRIT-1/2.
 *
 * Stubs `findUnique` directly on the real prisma singleton (then restores
 * it). Avoids the resetModules / vi.doMock dance which doesn't reliably
 * rewrite the lazily-required prisma import inside the middleware.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prisma = require('../src/lib/prisma')
const { requireFeatureFlag, _clearCache } = require('../src/middleware/featureFlagGate')

const originalFindUnique = prisma.featureFlag.findUnique

beforeEach(() => {
  _clearCache()
})

afterEach(() => {
  prisma.featureFlag.findUnique = originalFindUnique
  vi.restoreAllMocks()
})

function makeReqRes() {
  const status = vi.fn().mockReturnThis()
  const json = vi.fn().mockReturnThis()
  return {
    req: {},
    res: { status, json },
    next: vi.fn(),
  }
}

describe('requireFeatureFlag — fail-closed', () => {
  it('blocks with 503 when flag row is missing', async () => {
    prisma.featureFlag.findUnique = vi.fn(async () => null)
    const mw = requireFeatureFlag('flag_hub_ai_attachments')
    const { req, res, next } = makeReqRes()
    await mw(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('blocks with 503 when flag is enabled:false', async () => {
    prisma.featureFlag.findUnique = vi.fn(async () => ({ enabled: false }))
    const mw = requireFeatureFlag('flag_scholar_enabled')
    const { req, res, next } = makeReqRes()
    await mw(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('passes through when flag is enabled:true', async () => {
    prisma.featureFlag.findUnique = vi.fn(async () => ({ enabled: true }))
    const mw = requireFeatureFlag('flag_hub_ai_attachments')
    const { req, res, next } = makeReqRes()
    await mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('blocks with 503 on DB error (fail-closed)', async () => {
    prisma.featureFlag.findUnique = vi.fn(async () => {
      throw new Error('db down')
    })
    const mw = requireFeatureFlag('flag_hub_ai_attachments')
    const { req, res, next } = makeReqRes()
    await mw(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(503)
  })
})
