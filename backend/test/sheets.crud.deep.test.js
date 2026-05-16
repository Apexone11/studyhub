/**
 * Deep test coverage — GET/:id, POST/, PATCH/:id, DELETE/:id on /api/sheets.
 *
 * Covers owner-vs-non-owner visibility on draft sheets, A12 numeric-ID
 * validation, contentFormat handling, HTML scan pipeline rerun on PATCH,
 * 403s for non-owners attempting to edit metadata, status preservation,
 * and cascade delete via Prisma cascade. All side-effects (plagiarism,
 * provenance, moderation, achievements) are mocked.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const crudControllerPath = require.resolve('../src/modules/sheets/sheets.crud.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'owner', role: 'student' } }

  const prisma = {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    starredSheet: { findUnique: vi.fn() },
    reaction: { count: vi.fn(), findUnique: vi.fn() },
    comment: { count: vi.fn() },
    sheetContribution: { findMany: vi.fn() },
    sheetCommit: { findFirst: vi.fn() },
    moderationCase: { create: vi.fn(), findFirst: vi.fn() },
    provenanceManifest: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return res_unauth(_res)
      req.user = { ...state.user }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    optionalAuth: vi.fn((req, _res, next) => {
      if (state.user) req.user = { ...state.user }
      next()
    }),
    sentry: { captureError: vi.fn() },
    htmlSecurity: {
      validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })),
      RISK_TIER: { CLEAN: 0, FLAGGED: 1, HIGH_RISK: 2, QUARANTINED: 3 },
    },
    htmlDraftValidation: {
      scanHtmlContentForPersistence: vi.fn().mockResolvedValue({
        htmlRiskTier: 0,
        htmlScanFindings: [],
        htmlScanStatus: 'clean',
      }),
    },
    htmlKillSwitch: { isHtmlUploadsEnabled: vi.fn().mockResolvedValue({ enabled: true }) },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(),
    },
    plagiarismService: { updateFingerprint: vi.fn() },
    plagiarism: { findSimilarSheets: vi.fn().mockResolvedValue([]) },
    notify: { createNotification: vi.fn().mockResolvedValue(undefined) },
    plagiarismModule: { runPlagiarismScan: vi.fn() },
    provenance: {
      createProvenanceToken: vi.fn(() => ({
        originHash: 'hash',
        encryptedToken: 'tok',
        algorithm: 'aes',
        iv: 'iv',
        authTag: 'tag',
      })),
    },
    storage: { cleanupAttachmentIfUnused: vi.fn() },
    timing: {
      timedSection: vi.fn(async (_label, fn) => ({ data: await fn() })),
      logTiming: vi.fn(),
    },
    activityTracker: { trackActivity: vi.fn() },
    events: { EVENTS: { SHEET_FIRST_CREATED: 'sheet.first_created' }, trackServerEvent: vi.fn() },
    abuseDetection: { runAbuseChecks: vi.fn() },
    achievements: {
      checkAndAwardBadgesLegacy: vi.fn(),
      emitAchievementEvent: vi.fn(),
      EVENT_KINDS: {
        SHEET_PUBLISH: 'sheet.publish',
        AI_PUBLISH_SHEET: 'ai.publish_sheet',
      },
      checkAndAwardBadges: vi.fn(),
    },
    sheetsService: {
      resolveNextSheetStatus: vi.fn(({ requestedStatus, contentFormat }) => {
        if (requestedStatus === 'draft') return 'draft'
        if (contentFormat === 'html') return 'pending_review'
        return 'published'
      }),
      normalizeContentFormat: vi.fn((v) => (v === 'html' ? 'html' : 'markdown')),
      getUserDefaultDownloads: vi.fn().mockResolvedValue(true),
      normalizeSheetStatus: vi.fn((v, fallback) => v || fallback),
      canReadSheet: vi.fn((sheet, user) => {
        if (sheet.status === 'published') return true
        return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
      }),
      canModerateOrOwnSheet: vi.fn((sheet, user) =>
        Boolean(user && (user.role === 'admin' || user.userId === sheet.userId)),
      ),
    },
    serializer: {
      serializeSheet: vi.fn((sheet, opts = {}) => ({ ...sheet, ...opts })),
      fetchContributionCollections: vi.fn().mockResolvedValue({}),
    },
    extractPreviewText: { extractPreviewText: vi.fn((s) => String(s || '').slice(0, 200)) },
    getUserPlan: { getUserTier: vi.fn().mockResolvedValue('free') },
    paymentsConstants: {
      PLANS: { free: { uploadsPerMonth: 50 }, pro_monthly: { uploadsPerMonth: -1 } },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
    sheetsConstants: {
      SHEET_STATUS: {
        DRAFT: 'draft',
        PENDING_REVIEW: 'pending_review',
        PUBLISHED: 'published',
        REJECTED: 'rejected',
        QUARANTINED: 'quarantined',
      },
      AUTHOR_SELECT: { id: true, username: true, avatarUrl: true, isStaffVerified: true },
      sheetWriteLimiter: (_req, _res, next) => next(),
    },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId }) => {
        if (user?.role === 'admin' || user?.userId === ownerId) return true
        res.status(403).json({ error: 'Forbidden' })
        return false
      }),
      sendForbidden: (res, msg) => res.status(403).json({ error: msg }),
      isAdmin: (u) => u?.role === 'admin',
      isOwner: (u, id) => u?.userId === id,
    },
    errorEnvelope: {
      sendError: (res, status, message, code) => res.status(status).json({ error: message, code }),
      ERROR_CODES: {
        BAD_REQUEST: 'BAD_REQUEST',
        VALIDATION: 'VALIDATION',
        INTERNAL: 'INTERNAL',
        NOT_FOUND: 'NOT_FOUND',
      },
    },
    rateLimiters: { sheetReadmeLimiter: (_req, _res, next) => next() },
  }
})

function res_unauth(res) {
  return res.status(401).json({ error: 'Login required.' })
}

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/requireAuth'), mocks.auth],
  [require.resolve('../src/core/auth/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/lib/html/htmlSecurity'), mocks.htmlSecurity],
  [require.resolve('../src/lib/html/htmlDraftValidation'), mocks.htmlDraftValidation],
  [require.resolve('../src/lib/html/htmlKillSwitch'), mocks.htmlKillSwitch],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/plagiarismService'), mocks.plagiarismService],
  [require.resolve('../src/lib/plagiarism'), mocks.plagiarism],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/modules/plagiarism/plagiarism.service'), mocks.plagiarismModule],
  [require.resolve('../src/lib/provenance'), mocks.provenance],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/requestTiming'), mocks.timing],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/events'), mocks.events],
  [require.resolve('../src/lib/abuseDetection'), mocks.abuseDetection],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
  [require.resolve('../src/lib/badges'), mocks.achievements],
  [require.resolve('../src/modules/sheets/sheets.service'), mocks.sheetsService],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
  [require.resolve('../src/lib/sheets/extractPreviewText'), mocks.extractPreviewText],
  [require.resolve('../src/lib/getUserPlan'), mocks.getUserPlan],
  [require.resolve('../src/modules/payments/payments.constants'), mocks.paymentsConstants],
  [require.resolve('../src/lib/logger'), mocks.logger],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/middleware/errorEnvelope'), mocks.errorEnvelope],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
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
  delete require.cache[crudControllerPath]
  const routerModule = require(crudControllerPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[crudControllerPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.user = { userId: 1, username: 'owner', role: 'student' }
  mocks.htmlKillSwitch.isHtmlUploadsEnabled.mockResolvedValue({ enabled: true })
  mocks.htmlSecurity.validateHtmlForSubmission.mockReturnValue({ ok: true, issues: [] })
  mocks.htmlDraftValidation.scanHtmlContentForPersistence.mockResolvedValue({
    htmlRiskTier: 0,
    htmlScanFindings: [],
    htmlScanStatus: 'clean',
  })
  mocks.sheetsService.canReadSheet.mockImplementation((sheet, user) => {
    if (sheet.status === 'published') return true
    return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
  })
  mocks.prisma.studySheet.count.mockResolvedValue(0)
})

function published(overrides = {}) {
  return {
    id: 10,
    userId: 1,
    title: 'Sheet',
    description: '',
    content: '# Hi',
    contentFormat: 'markdown',
    status: 'published',
    attachmentUrl: null,
    allowEditing: true,
    allowDownloads: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    htmlVersions: [],
    course: { code: 'X', school: { name: 'U' } },
    forkSource: null,
    ...overrides,
  }
}

// ── GET /:id ──────────────────────────────────────────────────────
describe('GET /api/sheets/:id', () => {
  it('owner sees their own DRAFT sheet (200)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published({ status: 'draft' }))
    const res = await request(app).get('/api/sheets/10')
    expect(res.status).toBe(200)
  })

  it('non-owner gets 404 on a DRAFT sheet', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published({ status: 'draft' }))
    const res = await request(app).get('/api/sheets/10')
    expect(res.status).toBe(404)
  })

  it('anonymous viewer can see a PUBLISHED sheet (200)', async () => {
    mocks.state.user = null
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published())
    const res = await request(app).get('/api/sheets/10')
    expect(res.status).toBe(200)
  })

  it('admin sees any DRAFT sheet (200)', async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published({ status: 'draft' }))
    const res = await request(app).get('/api/sheets/10')
    expect(res.status).toBe(200)
  })

  it('A12: returns 400 for non-integer id', async () => {
    const res = await request(app).get('/api/sheets/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid/i)
  })

  it('returns 404 when sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/sheets/123')
    expect(res.status).toBe(404)
  })
})

// ── POST / ────────────────────────────────────────────────────────
describe('POST /api/sheets — create', () => {
  it('creates with default status=published for markdown content', async () => {
    mocks.prisma.studySheet.create.mockResolvedValue(published())
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0) // quota
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1) // firstCreation
    const res = await request(app).post('/api/sheets').send({
      title: 'New',
      content: '# New',
      courseId: 1,
    })
    expect(res.status).toBe(201)
    const args = mocks.prisma.studySheet.create.mock.calls[0][0]
    expect(args.data.status).toBe('published')
  })

  it('400 when title missing', async () => {
    const res = await request(app).post('/api/sheets').send({ content: '# X', courseId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Title/i)
  })

  it('400 when content missing', async () => {
    const res = await request(app).post('/api/sheets').send({ title: 'T', courseId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Content/i)
  })

  it('400 when courseId missing', async () => {
    const res = await request(app).post('/api/sheets').send({ title: 'T', content: '# X' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Course/i)
  })

  it('honors contentFormat=html and routes through HTML scan pipeline', async () => {
    mocks.prisma.studySheet.create.mockResolvedValue(
      published({ contentFormat: 'html', status: 'pending_review' }),
    )
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '<p>Hello</p>',
      courseId: 1,
      contentFormat: 'html',
    })
    expect(res.status).toBe(201)
    expect(mocks.htmlSecurity.validateHtmlForSubmission).toHaveBeenCalled()
    expect(mocks.htmlDraftValidation.scanHtmlContentForPersistence).toHaveBeenCalled()
  })

  it('HTML kill switch DISABLED → 403 + code HTML_UPLOADS_DISABLED', async () => {
    mocks.htmlKillSwitch.isHtmlUploadsEnabled.mockResolvedValueOnce({ enabled: false })
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '<p>X</p>',
      courseId: 1,
      contentFormat: 'html',
    })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('HTML_UPLOADS_DISABLED')
  })

  it('HTML Tier 3 quarantine → status flips to QUARANTINED', async () => {
    mocks.htmlDraftValidation.scanHtmlContentForPersistence.mockResolvedValueOnce({
      htmlRiskTier: 3,
      htmlScanFindings: [{ name: 'bad', severity: 'critical' }],
      htmlScanStatus: 'quarantined',
    })
    mocks.prisma.studySheet.create.mockResolvedValue(published({ status: 'quarantined' }))
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '<script>steal()</script>',
      courseId: 1,
      contentFormat: 'html',
    })
    expect(res.status).toBe(201)
    const args = mocks.prisma.studySheet.create.mock.calls[0][0]
    expect(args.data.status).toBe('quarantined')
  })

  it('upload quota exhausted → 403 UPLOAD_LIMIT', async () => {
    mocks.getUserPlan.getUserTier.mockResolvedValueOnce('free')
    mocks.prisma.studySheet.count.mockResolvedValueOnce(50) // free=50/month, at cap
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '# X',
      courseId: 1,
    })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('UPLOAD_LIMIT')
  })

  it('forkOf must point to a published sheet — rejects unpublished', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({ id: 5, status: 'draft' })
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '# X',
      courseId: 1,
      forkOf: 5,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/published sheet/i)
  })

  it('emits AI_PUBLISH_SHEET event when source=hub-ai and status=published', async () => {
    mocks.prisma.studySheet.create.mockResolvedValue(published())
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '# X',
      courseId: 1,
      source: 'hub-ai',
    })
    expect(res.status).toBe(201)
    // Should fire both SHEET_PUBLISH and AI_PUBLISH_SHEET.
    const kinds = mocks.achievements.emitAchievementEvent.mock.calls.map((c) => c[2])
    expect(kinds).toContain('sheet.publish')
    expect(kinds).toContain('ai.publish_sheet')
  })

  it("returns firstCreation=true on the user's first sheet", async () => {
    mocks.prisma.studySheet.create.mockResolvedValue(published())
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0) // quota
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1) // count after = 1
    const res = await request(app).post('/api/sheets').send({
      title: 'T',
      content: '# X',
      courseId: 1,
    })
    expect(res.status).toBe(201)
    expect(res.body.firstCreation).toBe(true)
  })

  it('previewText is set on create via extractPreviewText', async () => {
    mocks.prisma.studySheet.create.mockResolvedValue(published())
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)
    await request(app).post('/api/sheets').send({
      title: 'T',
      content: '# Long content here',
      courseId: 1,
    })
    expect(mocks.extractPreviewText.extractPreviewText).toHaveBeenCalled()
    const args = mocks.prisma.studySheet.create.mock.calls[0][0]
    expect(args.data.previewText).toBeTruthy()
  })
})

// ── PATCH /:id ────────────────────────────────────────────────────
describe('PATCH /api/sheets/:id', () => {
  it('owner can edit metadata', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published())
    mocks.prisma.studySheet.update.mockResolvedValue(published({ title: 'Renamed' }))
    const res = await request(app).patch('/api/sheets/10').send({ title: 'Renamed' })
    expect(res.status).toBe(200)
  })

  it('non-owner cannot edit metadata fields like allowDownloads (403)', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue(
      published({ userId: 1, allowEditing: true }),
    )
    const res = await request(app).patch('/api/sheets/10').send({ allowDownloads: false })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Only the owner/i)
  })

  it('non-owner with allowEditing=true CAN edit content fields', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue(
      published({ userId: 1, allowEditing: true }),
    )
    mocks.prisma.studySheet.update.mockResolvedValue(published({ content: '# updated' }))
    const res = await request(app).patch('/api/sheets/10').send({ content: '# updated' })
    expect(res.status).toBe(200)
  })

  it('non-owner WITHOUT allowEditing → 403', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue(
      published({ userId: 1, allowEditing: false }),
    )
    const res = await request(app).patch('/api/sheets/10').send({ content: 'X' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/editing/i)
  })

  it('404 when sheet not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)
    const res = await request(app).patch('/api/sheets/10').send({ title: 'X' })
    expect(res.status).toBe(404)
  })

  // Founder directive 2026-05-13 — admin is a moderator role, not a
  // creator role. PATCH /api/sheets/:id is a content edit; admin must
  // not silently edit other users' sheets here. Moderation routes on
  // /api/admin/* are the audit-logged path for any admin-driven
  // change to user content.
  it('admin CANNOT patch other users sheets (moderation goes through /api/admin/*)', async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue(
      published({ userId: 1, allowEditing: false }),
    )
    const res = await request(app).patch('/api/sheets/10').send({ title: 'Admin edit' })
    expect(res.status).toBe(403)
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('re-extracts previewText on content update', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published())
    mocks.prisma.studySheet.update.mockResolvedValue(published())
    await request(app).patch('/api/sheets/10').send({ content: '# changed content' })
    expect(mocks.extractPreviewText.extractPreviewText).toHaveBeenCalled()
    const args = mocks.prisma.studySheet.update.mock.calls[0][0]
    expect(args.data.previewText).toBeTruthy()
  })

  it('empty content body → 400', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(published())
    const res = await request(app).patch('/api/sheets/10').send({ content: '   ' })
    expect(res.status).toBe(400)
  })
})

// ── DELETE /:id ───────────────────────────────────────────────────
describe('DELETE /api/sheets/:id', () => {
  it('owner can delete their own sheet (200)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({ id: 10, userId: 1, attachmentUrl: null })
    mocks.prisma.studySheet.delete.mockResolvedValue({ id: 10 })
    const res = await request(app).delete('/api/sheets/10')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted/i)
    expect(mocks.prisma.studySheet.delete).toHaveBeenCalledWith({ where: { id: 10 } })
  })

  it('non-owner cannot delete (403)', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue({ id: 10, userId: 1, attachmentUrl: null })
    const res = await request(app).delete('/api/sheets/10')
    expect(res.status).toBe(403)
    expect(mocks.prisma.studySheet.delete).not.toHaveBeenCalled()
  })

  it("admin can delete anyone's sheet (200)", async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValue({ id: 10, userId: 1, attachmentUrl: null })
    mocks.prisma.studySheet.delete.mockResolvedValue({ id: 10 })
    const res = await request(app).delete('/api/sheets/10')
    expect(res.status).toBe(200)
  })

  it('404 when sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/api/sheets/9999')
    expect(res.status).toBe(404)
  })

  it('cleanupAttachmentIfUnused runs after successful delete', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      attachmentUrl: '/uploads/foo.pdf',
    })
    mocks.prisma.studySheet.delete.mockResolvedValue({ id: 10 })
    await request(app).delete('/api/sheets/10')
    expect(mocks.storage.cleanupAttachmentIfUnused).toHaveBeenCalledWith(
      mocks.prisma,
      '/uploads/foo.pdf',
      expect.any(Object),
    )
  })
})
