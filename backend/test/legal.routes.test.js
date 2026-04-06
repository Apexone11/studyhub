import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const legalRoutePath = require.resolve('../src/modules/legal')

const mocks = vi.hoisted(() => ({
  auth: vi.fn((req, _res, next) => {
    req.user = { userId: 42, username: 'legal_user', role: 'student' }
    next()
  }),
  sentry: {
    captureError: vi.fn(),
  },
  legalService: {
    acceptCurrentLegalDocuments: vi.fn(),
    getCurrentLegalDocument: vi.fn(),
    getCurrentLegalDocuments: vi.fn(),
    getUserLegalStatus: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/modules/legal/legal.service'), mocks.legalService],
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

  delete require.cache[legalRoutePath]
  const routerModule = require(legalRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[legalRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('legal routes', () => {
  it('returns the current legal document list', async () => {
    mocks.legalService.getCurrentLegalDocuments.mockResolvedValue([
      {
        slug: 'terms',
        version: '2026-04-04',
        title: 'Terms and Conditions',
        requiredAtSignup: true,
      },
      {
        slug: 'privacy',
        version: '2026-04-04',
        title: 'Privacy Policy',
        requiredAtSignup: true,
      },
    ])

    const response = await request(app).get('/current')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      documents: [
        expect.objectContaining({ slug: 'terms', title: 'Terms and Conditions' }),
        expect.objectContaining({ slug: 'privacy', title: 'Privacy Policy' }),
      ],
    })
    expect(mocks.legalService.getCurrentLegalDocuments).toHaveBeenCalledTimes(1)
  })

  it('returns a specific current legal document by slug', async () => {
    mocks.legalService.getCurrentLegalDocument.mockResolvedValue({
      slug: 'terms',
      version: '2026-04-04',
      title: 'Terms and Conditions',
      bodyText: 'Legal text',
    })

    const response = await request(app).get('/current/terms')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      slug: 'terms',
      version: '2026-04-04',
      title: 'Terms and Conditions',
      bodyText: 'Legal text',
    })
    expect(mocks.legalService.getCurrentLegalDocument).toHaveBeenCalledWith('terms')
  })

  it('returns 404 when a current legal document slug is unknown', async () => {
    mocks.legalService.getCurrentLegalDocument.mockResolvedValue(null)

    const response = await request(app).get('/current/unknown')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Legal document not found.' })
  })

  it('returns the authenticated user legal status', async () => {
    mocks.legalService.getUserLegalStatus.mockResolvedValue({
      currentVersion: '2026-04-04',
      acceptedVersion: '2026-04-04',
      needsAcceptance: false,
      missingRequiredDocuments: [],
      acceptedDocuments: ['terms', 'privacy', 'guidelines'],
    })

    const response = await request(app).get('/me/status')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      currentVersion: '2026-04-04',
      acceptedVersion: '2026-04-04',
      needsAcceptance: false,
      acceptedDocuments: ['terms', 'privacy', 'guidelines'],
    })
    expect(mocks.legalService.getUserLegalStatus).toHaveBeenCalledWith(42)
  })

  it('accepts the current legal documents for the authenticated user', async () => {
    mocks.legalService.acceptCurrentLegalDocuments.mockResolvedValue({
      currentVersion: '2026-04-04',
      acceptedVersion: '2026-04-04',
      needsAcceptance: false,
      acceptedDocuments: ['terms', 'privacy', 'guidelines'],
      missingRequiredDocuments: [],
    })

    const response = await request(app).post('/me/accept-current').send({})

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      acceptedVersion: '2026-04-04',
      needsAcceptance: false,
      acceptedDocuments: ['terms', 'privacy', 'guidelines'],
    })
    expect(mocks.legalService.acceptCurrentLegalDocuments).toHaveBeenCalledWith(42)
  })
})