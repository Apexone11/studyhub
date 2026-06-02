import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const exportControllerPath = require.resolve('../src/modules/settings/settings.export.controller')

/* ── Mock factory ──────────────────────────────────────────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student' }

  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    studySheet: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
    feedPost: { findMany: vi.fn() },
    // Real model names (the controller previously called non-existent
    // prisma.contribution / prisma.star / prisma.preferences, which 500'd
    // the live export; this mock now mirrors the actual Prisma client).
    sheetContribution: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    starredSheet: { findMany: vi.fn() },
    noteStar: { findMany: vi.fn() },
    userPreferences: { findUnique: vi.fn() },
    conversationParticipant: { findMany: vi.fn() },
    studyGroupMember: { findMany: vi.fn() },
    // Models the export controller added after this test was written
    // (Hub AI v2 + Scholar). Unmocked queries throw and the route
    // returns 500. Default to empty arrays so the export shape is valid.
    aiAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    aiUsageLog: { findMany: vi.fn().mockResolvedValue([]) },
    scholarAnnotation: { findMany: vi.fn().mockResolvedValue([]) },
    scholarDiscussionThread: { findMany: vi.fn().mockResolvedValue([]) },
  }

  return {
    state,
    prisma,
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      exportDataLimiter: (_req, _res, next) => next(),
    },
  }
})

/* ── Wire mock targets ────────────────────────────────────────────────── */
const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[exportControllerPath]

  const controllerModule = require(exportControllerPath)
  const controller = controllerModule.default || controllerModule

  // Mount the export controller directly, injecting a fake req.user
  app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = {
      userId: mocks.state.userId,
      username: mocks.state.username,
      role: mocks.state.role,
    }
    next()
  })
  app.use('/', controller)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[exportControllerPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'test_user'
})

/* ── Data Export Tests ─────────────────────────────────────────────────── */

describe('GET /export', () => {
  const mockProfile = {
    id: 42,
    username: 'test_user',
    email: 'test@example.com',
    displayName: 'Test User',
    bio: 'A test user',
    avatarUrl: null,
    coverImageUrl: null,
    accountType: 'student',
    authProvider: 'local',
    createdAt: new Date('2026-01-01'),
    lastLoginAt: new Date('2026-04-01'),
  }

  it('returns a JSON file with all user data', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(mockProfile)
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      { id: 1, title: 'My Sheet', createdAt: new Date() },
    ])
    mocks.prisma.note.findMany.mockResolvedValue([])
    mocks.prisma.feedPost.findMany.mockResolvedValue([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValue([])
    mocks.prisma.enrollment.findMany.mockResolvedValue([])
    mocks.prisma.starredSheet.findMany.mockResolvedValue([])
    mocks.prisma.noteStar.findMany.mockResolvedValue([])
    mocks.prisma.userPreferences.findUnique.mockResolvedValue({ theme: 'dark' })
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])

    const res = await request(app).get('/export')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.headers['content-disposition']).toMatch(/studyhub-export/)
    expect(res.body.format).toBe('StudyHub Data Export v1.0')
    expect(res.body.user.username).toBe('test_user')
    expect(res.body.sheets).toHaveLength(1)
    expect(res.body.exportedAt).toBeDefined()
  })

  it('includes all data categories in export', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(mockProfile)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])
    mocks.prisma.feedPost.findMany.mockResolvedValue([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValue([])
    mocks.prisma.enrollment.findMany.mockResolvedValue([])
    mocks.prisma.starredSheet.findMany.mockResolvedValue([])
    mocks.prisma.noteStar.findMany.mockResolvedValue([])
    mocks.prisma.userPreferences.findUnique.mockResolvedValue(null)
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])

    const res = await request(app).get('/export')

    expect(res.status).toBe(200)
    const data = res.body
    expect(data).toHaveProperty('user')
    expect(data).toHaveProperty('sheets')
    expect(data).toHaveProperty('notes')
    expect(data).toHaveProperty('feedPosts')
    expect(data).toHaveProperty('contributions')
    expect(data).toHaveProperty('enrollments')
    expect(data).toHaveProperty('starredSheets')
    expect(data).toHaveProperty('starredNotes')
    expect(data).toHaveProperty('preferences')
    expect(data).toHaveProperty('conversations')
    expect(data).toHaveProperty('studyGroups')
  })

  it('degrades gracefully when a section fails: 200 + partial flag, not 500', async () => {
    // A single failing sub-query must not deny the user the rest of their
    // data (resilient) but the export must declare itself partial (honest)
    // and the failure must be logged server-side (observable).
    mocks.prisma.user.findUnique.mockRejectedValue(new Error('DB error'))
    mocks.prisma.studySheet.findMany.mockResolvedValue([{ id: 1, title: 'Kept' }])
    mocks.prisma.note.findMany.mockResolvedValue([])
    mocks.prisma.feedPost.findMany.mockResolvedValue([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValue([])
    mocks.prisma.enrollment.findMany.mockResolvedValue([])
    mocks.prisma.starredSheet.findMany.mockResolvedValue([])
    mocks.prisma.noteStar.findMany.mockResolvedValue([])
    mocks.prisma.userPreferences.findUnique.mockResolvedValue(null)
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])

    const res = await request(app).get('/export')

    expect(res.status).toBe(200)
    expect(res.body.partial).toBe(true)
    expect(res.body.incompleteSections).toContain('profile')
    expect(res.body.user).toBeNull()
    // The sections that succeeded are still present.
    expect(res.body.sheets).toHaveLength(1)
  })

  it('marks a complete export as not partial', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(mockProfile)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])
    mocks.prisma.feedPost.findMany.mockResolvedValue([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValue([])
    mocks.prisma.enrollment.findMany.mockResolvedValue([])
    mocks.prisma.starredSheet.findMany.mockResolvedValue([])
    mocks.prisma.noteStar.findMany.mockResolvedValue([])
    mocks.prisma.userPreferences.findUnique.mockResolvedValue(null)
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])

    const res = await request(app).get('/export')

    expect(res.status).toBe(200)
    expect(res.body.partial).toBe(false)
    expect(res.body.incompleteSections).toBeUndefined()
  })
})
