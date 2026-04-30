import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/creatorAudit/creatorAudit.controller')

const mocks = vi.hoisted(() => ({
  prisma: {
    studySheet: { findUnique: vi.fn(), updateMany: vi.fn() },
    note: { findUnique: vi.fn(), updateMany: vi.fn() },
    material: { findUnique: vi.fn(), updateMany: vi.fn() },
    creatorAuditConsent: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  sentry: { captureError: vi.fn() },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load
let loadAuditEntity
let acceptConsent
let persistAuditResult

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[controllerPath]
  ;({
    acceptConsent,
    loadAuditEntity,
    persistAuditResult,
  } = require('../src/modules/creatorAudit/creatorAudit.controller'))
})

afterAll(() => {
  Module._load = originalModuleLoad
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadAuditEntity', () => {
  it('loads sheet content for the owner', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 7,
      title: 'Sheet',
      content: '<h1>Sheet</h1>',
    })

    await expect(loadAuditEntity('sheet', 1, 7)).resolves.toEqual({
      title: 'Sheet',
      contentHtml: '<h1>Sheet</h1>',
    })
  })

  it('refuses sheet content that belongs to another user', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 8,
      title: 'Sheet',
      content: '<h1>Private</h1>',
    })

    await expect(loadAuditEntity('sheet', 1, 7)).resolves.toEqual({ forbidden: true })
  })

  it('returns null when a note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)

    await expect(loadAuditEntity('note', 404, 7)).resolves.toBeNull()
  })

  it('combines teacher-owned material instructions and linked content', async () => {
    mocks.prisma.material.findUnique.mockResolvedValueOnce({
      id: 3,
      teacherId: 7,
      title: 'Week 1',
      instructions: '<p>Read first</p>',
      sheet: { content: '<h1>Sheet body</h1>' },
      note: { content: '<p>Note body</p>' },
    })

    await expect(loadAuditEntity('material', 3, 7)).resolves.toEqual({
      title: 'Week 1',
      contentHtml: '<p>Read first</p>\n\n<h1>Sheet body</h1>\n\n<p>Note body</p>',
    })
  })

  it('refuses material content owned by another teacher', async () => {
    mocks.prisma.material.findUnique.mockResolvedValueOnce({
      id: 3,
      teacherId: 8,
      title: 'Week 1',
      instructions: '<p>Private</p>',
      sheet: null,
      note: null,
    })

    await expect(loadAuditEntity('material', 3, 7)).resolves.toEqual({ forbidden: true })
  })
})

describe('acceptConsent', () => {
  it('returns existing current-version consent without rewriting acceptedAt', async () => {
    const acceptedAt = new Date('2026-04-28T12:00:00Z')
    mocks.prisma.creatorAuditConsent.findUnique.mockResolvedValueOnce({
      docVersion: '2026.04',
      acceptedAt,
    })
    const req = {
      body: { docVersion: '2026.04' },
      user: { userId: 7 },
      get: () => null,
      ip: '203.0.113.10',
    }
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    }

    await acceptConsent(req, res)

    expect(mocks.prisma.creatorAuditConsent.upsert).not.toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      accepted: true,
      docVersion: '2026.04',
      acceptedAt: acceptedAt.toISOString(),
    })
  })
})

describe('persistAuditResult', () => {
  it('persists sheet audit results with an owner-scoped update', async () => {
    mocks.prisma.studySheet.updateMany.mockResolvedValueOnce({ count: 1 })
    const report = { grade: 'B', findings: [] }

    await expect(persistAuditResult('sheet', 3, 7, report, '<h1>Sheet</h1>')).resolves.toBe(true)

    expect(mocks.prisma.studySheet.updateMany).toHaveBeenCalledWith({
      where: { id: 3, userId: 7, content: '<h1>Sheet</h1>' },
      data: {
        lastAuditGrade: 'B',
        lastAuditReport: report,
        lastAuditedAt: expect.any(Date),
      },
    })
  })

  it('returns stale when sheet content changes before audit persistence', async () => {
    mocks.prisma.studySheet.updateMany.mockResolvedValueOnce({ count: 0 })
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 3,
      userId: 7,
      title: 'Sheet',
      content: '<h1>Changed</h1>',
    })

    await expect(
      persistAuditResult('sheet', 3, 7, { grade: 'A' }, '<h1>Original</h1>'),
    ).resolves.toBe('stale')
  })

  it('returns false when the owner-scoped audit persistence guard updates no rows', async () => {
    mocks.prisma.material.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(persistAuditResult('material', 3, 7, { grade: 'F' })).resolves.toBe(false)
  })
})
