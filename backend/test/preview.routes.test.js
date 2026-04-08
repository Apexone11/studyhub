import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const previewRoutePath = require.resolve('../src/modules/preview')

const mocks = vi.hoisted(() => {
  const state = {
    sheet: null,
    payload: null,
    tokenError: null,
    validationResult: { ok: true, issues: [] },
  }

  const prisma = {
    studySheet: {
      findUnique: vi.fn(async () => state.sheet),
    },
  }

  const verifyHtmlPreviewToken = vi.fn(() => {
    if (state.tokenError) {
      throw state.tokenError
    }
    return state.payload
  })

  const validateHtmlForSubmission = vi.fn(() => state.validationResult)

  return {
    state,
    prisma,
    verifyHtmlPreviewToken,
    validateHtmlForSubmission,
    sentry: {
      captureError: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/previewTokens'), { verifyHtmlPreviewToken: mocks.verifyHtmlPreviewToken }],
  [require.resolve('../src/lib/html/htmlSecurity'), { validateHtmlForSubmission: mocks.validateHtmlForSubmission, RISK_TIER: { CLEAN: 0, FLAGGED: 1, HIGH_RISK: 2, QUARANTINED: 3 } }],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[previewRoutePath]
  const previewRouterModule = require(previewRoutePath)
  const previewRouter = previewRouterModule.default || previewRouterModule

  app = express()
  app.use('/', previewRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[previewRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  const updatedAt = new Date('2026-03-17T00:00:00.000Z')
  mocks.state.sheet = {
    id: 77,
    title: 'Preview Sheet',
    userId: 101,
    status: 'published',
    content: '<main><h1>Safe Preview</h1></main>',
    contentFormat: 'html',
    htmlRiskTier: 0,
    updatedAt,
  }
  mocks.state.payload = {
    type: 'html-preview',
    sheetId: 77,
    userId: 101,
    version: updatedAt.toISOString(),
    allowUnpublished: false,
  }
  mocks.state.tokenError = null
  mocks.state.validationResult = { ok: true, issues: [] }
})

describe('preview routes', () => {
  it('returns PREVIEW_TOKEN_INVALID when token is missing', async () => {
    const response = await request(app).get('/html')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      error: 'Preview token is required.',
      code: 'PREVIEW_TOKEN_INVALID',
    })
    expect(mocks.verifyHtmlPreviewToken).not.toHaveBeenCalled()
  })

  it('returns PREVIEW_TOKEN_INVALID when token is invalid or expired', async () => {
    mocks.state.tokenError = new Error('jwt expired')

    const response = await request(app)
      .get('/html')
      .query({ token: 'expired-token' })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      error: 'Preview token is invalid or expired.',
      code: 'PREVIEW_TOKEN_INVALID',
    })
  })

  it('rejects stale tokens when sheet version changes', async () => {
    mocks.state.payload.version = '2020-01-01T00:00:00.000Z'

    const response = await request(app)
      .get('/html')
      .query({ token: 'stale-token' })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      code: 'PREVIEW_TOKEN_INVALID',
    })
  })

  it('rejects unpublished sheets for non-owner tokens without allowance', async () => {
    mocks.state.sheet.status = 'draft'
    mocks.state.sheet.userId = 999
    mocks.state.payload.userId = 101
    mocks.state.payload.allowUnpublished = false

    const response = await request(app)
      .get('/html')
      .query({ token: 'non-owner-token' })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      code: 'PREVIEW_TOKEN_INVALID',
    })
  })

  it('allows unpublished sheets for owner tokens', async () => {
    mocks.state.sheet.status = 'draft'
    mocks.state.sheet.userId = 101
    mocks.state.payload.userId = 101
    mocks.state.payload.allowUnpublished = true

    const response = await request(app)
      .get('/html')
      .query({ token: 'owner-token' })

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/html/)
    expect(response.text).toContain('Safe Preview')
  })

  it('rejects quarantined sheets (Tier 3)', async () => {
    mocks.state.sheet.htmlRiskTier = 3
    mocks.state.payload.tier = 3

    const response = await request(app)
      .get('/html')
      .query({ token: 'quarantined-token' })

    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/quarantined/i)
  })
})
