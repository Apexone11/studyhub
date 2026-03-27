/**
 * IDOR / Permission Tests — Sheets (PATCH, DELETE)
 *
 * Proves: non-owner cannot update or delete another user's sheet.
 * Owner and admin CAN.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sheetsRoutePath = require.resolve('../src/modules/sheets')

/* ── Shared mutable state ──────────────────────────────────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42, role: 'student' }

  const prisma = {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    comment: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), groupBy: vi.fn() },
    reaction: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), groupBy: vi.fn() },
    starredSheet: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    course: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    contribution: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn() },
    pinnedSheet: { findMany: vi.fn() },
    $transaction: vi.fn((fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: 'test_user', role: state.role }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    storage: { cleanupAttachmentIfUnused: vi.fn(), resolveAttachmentPath: vi.fn() },
    accessControl: null, // Use the REAL accessControl — that's what we're testing
    htmlSecurity: {
      validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })),
      validateHtmlForRuntime: vi.fn(() => ({ ok: true, issues: [] })),
      classifyHtmlRisk: vi.fn(() => ({ tier: 0, reasons: [] })),
      RISK_TIER: { CLEAN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 },
    },
    htmlKillSwitch: { isHtmlUploadsEnabled: vi.fn(() => true) },
    moderationEngine: { isModerationEnabled: vi.fn(() => false), scanContent: vi.fn() },
    provenance: { createProvenanceToken: vi.fn(() => 'tok_fake') },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    attachmentPreview: { sendAttachmentPreview: vi.fn() },
    securityEvents: { logSecurityEvent: vi.fn() },
  }
})

/* ── Module._load intercepts ───────────────────────────────────────────── */
const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/htmlSecurity'), mocks.htmlSecurity],
  [require.resolve('../src/lib/htmlKillSwitch'), mocks.htmlKillSwitch],
  [require.resolve('../src/lib/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/provenance'), mocks.provenance],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/lib/securityEvents'), mocks.securityEvents],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()

    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch { /* unresolvable — fall through */ }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[sheetsRoutePath]
  const sheetsRouter = require(sheetsRoutePath)
  app = express()
  app.use(express.json())
  app.use('/api/sheets', sheetsRouter.default || sheetsRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[sheetsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.role = 'student'
})

/* ── Helpers ────────────────────────────────────────────────────────────── */
const OWNER_ID = 100
const NON_OWNER_ID = 42 // default test user
const ADMIN_ID = 99

const sheetFixture = (overrides = {}) => ({
  id: 1,
  userId: OWNER_ID,
  title: 'My Sheet',
  content: 'content',
  contentFormat: 'markdown',
  status: 'published',
  attachmentUrl: null,
  description: null,
  ...overrides,
})

/* ══════════════════════════════════════════════════════════════════════════
 * PATCH /api/sheets/:id
 * ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH /api/sheets/:id — ownership enforcement', () => {
  it('returns 403 when non-owner tries to update', async () => {
    mocks.state.userId = NON_OWNER_ID
    mocks.state.role = 'student'
    mocks.prisma.studySheet.findUnique.mockResolvedValue(sheetFixture())

    const res = await request(app)
      .patch('/api/sheets/1')
      .send({ title: 'Hijacked' })

    expect(res.status).toBe(403)
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
    expect(mocks.securityEvents.logSecurityEvent).toHaveBeenCalledWith(
      'access.denied',
      expect.objectContaining({ actorId: NON_OWNER_ID })
    )
  })

  it('passes auth gate when owner updates (update called)', async () => {
    mocks.state.userId = OWNER_ID
    mocks.state.role = 'student'
    const sheet = sheetFixture()
    mocks.prisma.studySheet.findUnique.mockResolvedValue(sheet)
    // update mock returns a rich shape — serializer may still fail, but
    // the IDOR test cares that update was reached (not 403).
    mocks.prisma.studySheet.update.mockResolvedValue({
      ...sheet, title: 'New Title',
      author: { id: OWNER_ID, username: 'owner' },
      course: null, htmlVersions: [], forkSource: null,
    })

    const res = await request(app)
      .patch('/api/sheets/1')
      .send({ title: 'New Title' })

    // Must NOT be 403 — owner should pass the ownership check
    expect(res.status).not.toBe(403)
    expect(mocks.prisma.studySheet.update).toHaveBeenCalled()
  })

  it('passes auth gate when admin updates (update called)', async () => {
    mocks.state.userId = ADMIN_ID
    mocks.state.role = 'admin'
    const sheet = sheetFixture()
    mocks.prisma.studySheet.findUnique.mockResolvedValue(sheet)
    mocks.prisma.studySheet.update.mockResolvedValue({
      ...sheet, title: 'Admin Edit',
      author: { id: ADMIN_ID, username: 'admin' },
      course: null, htmlVersions: [], forkSource: null,
    })

    const res = await request(app)
      .patch('/api/sheets/1')
      .send({ title: 'Admin Edit' })

    expect(res.status).not.toBe(403)
    expect(mocks.prisma.studySheet.update).toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * DELETE /api/sheets/:id
 * ══════════════════════════════════════════════════════════════════════════ */
describe('DELETE /api/sheets/:id — ownership enforcement', () => {
  it('returns 403 when non-owner tries to delete', async () => {
    mocks.state.userId = NON_OWNER_ID
    mocks.state.role = 'student'
    mocks.prisma.studySheet.findUnique.mockResolvedValue(sheetFixture())

    const res = await request(app).delete('/api/sheets/1')

    expect(res.status).toBe(403)
    expect(mocks.prisma.studySheet.delete).not.toHaveBeenCalled()
  })

  it('returns 200 when owner deletes their own sheet', async () => {
    mocks.state.userId = OWNER_ID
    mocks.state.role = 'student'
    mocks.prisma.studySheet.findUnique.mockResolvedValue(sheetFixture())
    mocks.prisma.studySheet.delete.mockResolvedValue({})

    const res = await request(app).delete('/api/sheets/1')

    expect(res.status).toBe(200)
    expect(mocks.prisma.studySheet.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('returns 200 when admin deletes any sheet', async () => {
    mocks.state.userId = ADMIN_ID
    mocks.state.role = 'admin'
    mocks.prisma.studySheet.findUnique.mockResolvedValue(sheetFixture())
    mocks.prisma.studySheet.delete.mockResolvedValue({})

    const res = await request(app).delete('/api/sheets/1')

    expect(res.status).toBe(200)
  })

  it('returns 404 for non-existent sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)

    const res = await request(app).delete('/api/sheets/999')

    expect(res.status).toBe(404)
    expect(mocks.prisma.studySheet.delete).not.toHaveBeenCalled()
  })
})
