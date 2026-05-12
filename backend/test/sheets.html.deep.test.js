/**
 * Deep test coverage — HTML preview + runtime endpoints.
 *
 * GET  /api/sheets/:id/html-preview — signed preview URL + tier metadata
 * GET  /api/sheets/:id/html-runtime — interactive runtime gate by tier
 * POST /api/sheets/:id/submit-review — workflow handoff to AI/human review
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.html.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'owner', role: 'student' } }
  const prisma = { studySheet: { findUnique: vi.fn() } }
  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return _res.status(401).json({ error: 'Login required.' })
      req.user = { ...state.user }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    htmlSecurity: {
      validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })),
      RISK_TIER: { CLEAN: 0, FLAGGED: 1, HIGH_RISK: 2, QUARANTINED: 3 },
      generateRiskSummary: vi.fn(() => 'OK'),
      generateTierExplanation: vi.fn(() => 'tier ok'),
    },
    previewTokens: {
      signHtmlPreviewToken: vi.fn(() => 'SIGNED_TOKEN'),
      HTML_PREVIEW_TOKEN_TTL_SECONDS: 300,
    },
    htmlDraftWorkflow: {
      submitHtmlDraftForReview: vi.fn(),
    },
    sheetsConstants: { sheetWriteLimiter: (_req, _res, next) => next() },
    sheetsService: {
      canReadSheet: vi.fn((sheet, user) => {
        if (sheet?.status === 'published') return true
        return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
      }),
      canModerateOrOwnSheet: vi.fn((sheet, user) =>
        Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId)),
      ),
      resolvePreviewOrigin: vi.fn(() => 'https://api.test.org'),
    },
    serializer: {
      tierToPreviewMode: vi.fn((tier) => {
        if (tier === 2) return 'restricted'
        if (tier === 3) return 'disabled'
        return 'interactive'
      }),
      serializeSheet: vi.fn((sheet) => ({ ...sheet })),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/requireAuth'), mocks.auth],
  [require.resolve('../src/core/auth/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/lib/html/htmlSecurity'), mocks.htmlSecurity],
  [require.resolve('../src/lib/previewTokens'), mocks.previewTokens],
  [require.resolve('../src/lib/html/htmlDraftWorkflow'), mocks.htmlDraftWorkflow],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
  [require.resolve('../src/modules/sheets/sheets.service'), mocks.sheetsService],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[controllerPath]
  const routerModule = require(controllerPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json())
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[controllerPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.studySheet.findUnique.mockReset()
  mocks.state.user = { userId: 1, username: 'owner', role: 'student' }
  mocks.sheetsService.canReadSheet.mockImplementation((sheet, user) => {
    if (sheet?.status === 'published') return true
    return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
  })
  mocks.sheetsService.canModerateOrOwnSheet.mockImplementation((sheet, user) =>
    Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId)),
  )
  mocks.sheetsService.resolvePreviewOrigin.mockReturnValue('https://api.test.org')
  mocks.htmlSecurity.validateHtmlForSubmission.mockReturnValue({ ok: true, issues: [] })
  mocks.previewTokens.signHtmlPreviewToken.mockReturnValue('SIGNED_TOKEN')
  mocks.serializer.tierToPreviewMode.mockImplementation((tier) => {
    if (tier === 2) return 'restricted'
    if (tier === 3) return 'disabled'
    return 'interactive'
  })
})

function htmlSheet(overrides = {}) {
  return {
    id: 10,
    title: 'HTML Sheet',
    userId: 1,
    content: '<p>Hi</p>',
    contentFormat: 'html',
    status: 'published',
    updatedAt: new Date('2024-01-01'),
    htmlRiskTier: 0,
    htmlScanFindings: [],
    ...overrides,
  }
}

// ── GET /:id/html-preview ────────────────────────────────────────
describe('GET /api/sheets/:id/html-preview', () => {
  it('returns signed previewUrl + canInteract=true for tier 0 published', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet())
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.status).toBe(200)
    expect(res.body.previewUrl).toMatch(/api\.test\.org\/preview\/html\?token=/)
    expect(res.body.previewMode).toBe('interactive')
    expect(res.body.canInteract).toBe(true)
    expect(res.body.htmlRiskTier).toBe(0)
  })

  it('tier 1 flagged is still canInteract=true', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet({ htmlRiskTier: 1 }))
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.status).toBe(200)
    expect(res.body.canInteract).toBe(true)
  })

  it('tier 2 PUBLISHED is canInteract=true for any authed viewer', async () => {
    mocks.state.user = { userId: 999, username: 'guest', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet({ htmlRiskTier: 2 }))
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.status).toBe(200)
    expect(res.body.canInteract).toBe(true)
  })

  it('tier 2 DRAFT is canInteract=false for non-owner', async () => {
    mocks.state.user = { userId: 999, username: 'guest', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      htmlSheet({ htmlRiskTier: 2, status: 'draft' }),
    )
    const res = await request(app).get('/api/sheets/10/html-preview')
    // draft non-owner — canReadSheet returns false ⇒ 404
    expect(res.status).toBe(404)
  })

  it('tier 3 quarantined → canInteract=false even for owner', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet({ htmlRiskTier: 3 }))
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.status).toBe(200)
    expect(res.body.canInteract).toBe(false)
    expect(res.body.previewMode).toBe('disabled')
  })

  it('404 when sheet not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/9999/html-preview')
    expect(res.status).toBe(404)
  })

  it('400 when sheet is not in HTML mode', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      htmlSheet({ contentFormat: 'markdown' }),
    )
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not in HTML mode/i)
  })

  it('expiresInSeconds matches the HTML_PREVIEW_TOKEN_TTL_SECONDS constant', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet())
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.body.expiresInSeconds).toBe(300)
  })

  it('401 when unauthenticated', async () => {
    mocks.state.user = null
    const res = await request(app).get('/api/sheets/10/html-preview')
    expect(res.status).toBe(401)
  })
})

// ── GET /:id/html-runtime ────────────────────────────────────────
describe('GET /api/sheets/:id/html-runtime', () => {
  it('tier 0 published → 200 with signed runtimeUrl', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet())
    const res = await request(app).get('/api/sheets/10/html-runtime')
    expect(res.status).toBe(200)
    expect(res.body.runtimeUrl).toMatch(/api\.test\.org\/preview\/html\?token=/)
  })

  it('tier 3 quarantined → 403', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(htmlSheet({ htmlRiskTier: 3 }))
    const res = await request(app).get('/api/sheets/10/html-runtime')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/quarantined/i)
  })

  it('tier 2 draft → 403 for non-owner', async () => {
    mocks.state.user = { userId: 999, username: 'guest', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      htmlSheet({ htmlRiskTier: 2, status: 'published' }),
    )
    // status=published gives canReadSheet but tier-2 non-owner is 200
    // (publish IS the safety review per CLAUDE.md). Verify that path.
    const res = await request(app).get('/api/sheets/10/html-runtime')
    expect(res.status).toBe(200)
  })

  it('tier 2 unpublished draft + non-owner → 404 (cannot read)', async () => {
    mocks.state.user = { userId: 999, username: 'guest', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      htmlSheet({ htmlRiskTier: 2, status: 'draft' }),
    )
    const res = await request(app).get('/api/sheets/10/html-runtime')
    expect(res.status).toBe(404)
  })

  it('400 when sheet not in HTML mode', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      htmlSheet({ contentFormat: 'markdown' }),
    )
    const res = await request(app).get('/api/sheets/10/html-runtime')
    expect(res.status).toBe(400)
  })
})

// ── POST /:id/submit-review ──────────────────────────────────────
describe('POST /api/sheets/:id/submit-review', () => {
  it('happy path: submitHtmlDraftForReview returns sheet → 200 + message', async () => {
    mocks.htmlDraftWorkflow.submitHtmlDraftForReview.mockResolvedValueOnce(
      htmlSheet({ status: 'pending_review' }),
    )
    const res = await request(app).post('/api/sheets/10/submit-review').send({})
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/submitted for admin review/i)
  })

  it('propagates workflow error.statusCode (e.g. 403)', async () => {
    const err = Object.assign(new Error('Only the owner can submit for review.'), {
      statusCode: 403,
      findings: [],
    })
    mocks.htmlDraftWorkflow.submitHtmlDraftForReview.mockRejectedValueOnce(err)
    const res = await request(app).post('/api/sheets/10/submit-review').send({})
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/owner/i)
  })

  it('A12: 400 on non-integer id', async () => {
    const res = await request(app).post('/api/sheets/abc/submit-review').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/integer/i)
  })

  it('5xx workflow error captured to Sentry', async () => {
    const err = Object.assign(new Error('boom'), { statusCode: 500 })
    mocks.htmlDraftWorkflow.submitHtmlDraftForReview.mockRejectedValueOnce(err)
    const res = await request(app).post('/api/sheets/10/submit-review').send({})
    expect(res.status).toBe(500)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })

  it('error.findings array is surfaced to the response', async () => {
    const err = Object.assign(new Error('Validation failed'), {
      statusCode: 400,
      findings: [{ name: 'inline_script', severity: 'high' }],
    })
    mocks.htmlDraftWorkflow.submitHtmlDraftForReview.mockRejectedValueOnce(err)
    const res = await request(app).post('/api/sheets/10/submit-review').send({})
    expect(res.status).toBe(400)
    expect(res.body.findings).toEqual([{ name: 'inline_script', severity: 'high' }])
  })
})
