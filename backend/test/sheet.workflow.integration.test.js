import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sheetsRoutePath = require.resolve('../src/routes/sheets')
const adminRoutePath = require.resolve('../src/routes/admin')

const mocks = vi.hoisted(() => {
  const users = [
    { id: 101, username: 'student_owner', role: 'student' },
    { id: 1, username: 'beta_admin', role: 'admin' },
  ]
  const courses = [
    {
      id: 10,
      code: 'CMSC131',
      name: 'Object-Oriented Programming I',
      school: { id: 1, name: 'University of Maryland', short: 'UMD' },
    },
  ]

  const state = {
    nextSheetId: 1,
    sheets: [],
    nextVersionId: 1,
    versions: [],
  }

  function reset() {
    state.nextSheetId = 1
    state.sheets = []
    state.nextVersionId = 1
    state.versions = []
  }

  function attachRelations(sheet) {
    const author = users.find((user) => user.id === sheet.userId)
    const course = courses.find((entry) => entry.id === sheet.courseId)
    const forkSource = sheet.forkOf
      ? state.sheets.find((entry) => entry.id === sheet.forkOf) || null
      : null

    return {
      ...sheet,
      htmlVersions: state.versions.filter((entry) => entry.sheetId === sheet.id),
      author: author ? { id: author.id, username: author.username } : null,
      course: course || null,
      forkSource: forkSource
        ? {
            id: forkSource.id,
            title: forkSource.title,
            userId: forkSource.userId,
            author: users.find((user) => user.id === forkSource.userId)
              ? {
                  id: forkSource.userId,
                  username: users.find((user) => user.id === forkSource.userId).username,
                }
              : null,
          }
        : null,
      incomingContributions: [],
      outgoingContributions: [],
    }
  }

  const studySheet = {
    findFirst: vi.fn(async ({ where } = {}) => {
      const matches = state.sheets
        .filter((sheet) => {
          if (!where) return true
          if (where.userId && sheet.userId !== where.userId) return false
          if (where.status && sheet.status !== where.status) return false
          return true
        })
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

      if (matches.length === 0) return null
      return attachRelations(matches[0])
    }),
    findUnique: vi.fn(async ({ where } = {}) => {
      const id = Number(where?.id)
      const sheet = state.sheets.find((entry) => entry.id === id)
      return sheet ? attachRelations(sheet) : null
    }),
    create: vi.fn(async ({ data }) => {
      const now = new Date().toISOString()
      const sheet = {
        id: state.nextSheetId++,
        title: data.title,
        content: data.content,
        contentFormat: data.contentFormat || 'markdown',
        status: data.status || 'published',
        htmlScanStatus: data.htmlScanStatus || 'queued',
        htmlScanFindings: data.htmlScanFindings || null,
        htmlScanUpdatedAt: data.htmlScanUpdatedAt || null,
        htmlScanAcknowledgedAt: data.htmlScanAcknowledgedAt || null,
        htmlOriginalArchivedAt: data.htmlOriginalArchivedAt || null,
        courseId: data.courseId,
        userId: data.userId,
        forkOf: data.forkOf || null,
        stars: 0,
        downloads: 0,
        forks: 0,
        description: data.description || '',
        attachmentUrl: data.attachmentUrl || null,
        attachmentType: data.attachmentType || null,
        attachmentName: data.attachmentName || null,
        allowDownloads: data.allowDownloads !== false,
        createdAt: now,
        updatedAt: now,
      }
      state.sheets.push(sheet)
      return attachRelations(sheet)
    }),
    update: vi.fn(async ({ where, data }) => {
      const id = Number(where?.id)
      const target = state.sheets.find((entry) => entry.id === id)
      if (!target) {
        const error = new Error('Record not found')
        error.code = 'P2025'
        throw error
      }

      for (const [key, value] of Object.entries(data || {})) {
        target[key] = value
      }
      target.updatedAt = new Date().toISOString()
      return attachRelations(target)
    }),
    count: vi.fn(async ({ where } = {}) => {
      if (!where) return state.sheets.length
      return state.sheets.filter((sheet) => {
        if (where.status && sheet.status !== where.status) return false
        return true
      }).length
    }),
    findMany: vi.fn(async ({ where } = {}) => {
      let rows = [...state.sheets]
      if (where?.status) rows = rows.filter((sheet) => sheet.status === where.status)
      return rows.map(attachRelations)
    }),
  }

  return {
    reset,
    prisma: {
      studySheet,
      sheetHtmlVersion: {
        upsert: vi.fn(async ({ where, create, update }) => {
          const sheetId = Number(where?.sheetId_kind?.sheetId)
          const kind = String(where?.sheetId_kind?.kind || '')
          const existing = state.versions.find((entry) => entry.sheetId === sheetId && entry.kind === kind)
          if (existing) {
            Object.assign(existing, update, { updatedAt: new Date().toISOString() })
            return { ...existing }
          }
          const record = {
            id: state.nextVersionId++,
            sheetId,
            userId: create.userId,
            kind: create.kind,
            sourceName: create.sourceName || null,
            content: create.content,
            checksum: create.checksum,
            compressionAlgo: create.compressionAlgo || null,
            compressedContent: create.compressedContent || null,
            archivedAt: create.archivedAt || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          state.versions.push(record)
          return { ...record }
        }),
        findMany: vi.fn(async ({ where } = {}) => {
          let rows = [...state.versions]
          if (where?.sheetId) rows = rows.filter((entry) => entry.sheetId === where.sheetId)
          if (where?.kind) rows = rows.filter((entry) => entry.kind === where.kind)
          return rows.map((entry) => ({ ...entry }))
        }),
        deleteMany: vi.fn(async ({ where } = {}) => {
          const before = state.versions.length
          state.versions = state.versions.filter((entry) => {
            if (!where) return false
            if (where?.sheetId && entry.sheetId !== where.sheetId) return true
            if (where?.kind && entry.kind !== where.kind) return true
            return false
          })
          return { count: before - state.versions.length }
        }),
        update: vi.fn(async ({ where, data }) => {
          const target = state.versions.find((entry) => entry.id === Number(where?.id))
          if (!target) {
            const error = new Error('Record not found')
            error.code = 'P2025'
            throw error
          }
          Object.assign(target, data, { updatedAt: new Date().toISOString() })
          return { ...target }
        }),
      },
      user: {
        count: vi.fn(async () => users.length),
      },
      comment: { count: vi.fn(async () => 0) },
      requestedCourse: { count: vi.fn(async () => 0) },
      note: { count: vi.fn(async () => 0) },
      userFollow: { count: vi.fn(async () => 0) },
      reaction: { count: vi.fn(async () => 0) },
      announcement: { count: vi.fn(async () => 0) },
      sheetContribution: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => null),
      },
      starredSheet: {
        findMany: vi.fn(async () => []),
      },
    },
    requireAuth: (req, res, next) => {
      const userId = Number(req.headers['x-test-user-id'] || 101)
      const role = String(req.headers['x-test-role'] || 'student')
      req.user = {
        userId,
        role,
        username: role === 'admin' ? 'beta_admin' : 'student_owner',
      }
      next()
    },
    sentry: {
      captureError: vi.fn(),
    },
    authTokens: {
      getAuthTokenFromRequest: vi.fn(() => null),
      verifyAuthToken: vi.fn(() => null),
    },
    notify: {
      createNotification: vi.fn(async () => null),
    },
    mentions: {
      notifyMentionedUsers: vi.fn(async () => null),
    },
    storage: {
      cleanupAttachmentIfUnused: vi.fn(async () => null),
      resolveAttachmentPath: vi.fn(() => ''),
    },
    attachmentPreview: {
      sendAttachmentPreview: vi.fn(async () => null),
    },
    deleteUserAccount: {
      deleteUserAccount: vi.fn(async () => null),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.requireAuth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/lib/deleteUserAccount'), mocks.deleteUserAccount],
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

  delete require.cache[sheetsRoutePath]
  delete require.cache[adminRoutePath]

  const sheetsRouterModule = require(sheetsRoutePath)
  const adminRouterModule = require(adminRoutePath)
  const sheetsRouter = sheetsRouterModule.default || sheetsRouterModule
  const adminRouter = adminRouterModule.default || adminRouterModule

  app = express()
  app.use(express.json())
  app.use('/sheets', sheetsRouter)
  app.use('/admin', adminRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[sheetsRoutePath]
  delete require.cache[adminRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reset()
})

describe('sheet workflow integration', () => {
  it('supports html import, working draft updates, scan status, and submit for review', async () => {
    const importResponse = await request(app)
      .post('/sheets/drafts/import-html')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Imported HTML',
        courseId: 10,
        description: 'Imported description',
        html: '<main><h1>Imported</h1></main>',
        sourceName: 'imported.html',
      })

    expect(importResponse.status).toBe(201)
    const draftId = importResponse.body.draft.id
    expect(importResponse.body.draft.htmlWorkflow.hasOriginalVersion).toBe(true)

    const updateResponse = await request(app)
      .patch(`/sheets/drafts/${draftId}/working-html`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Imported HTML',
        courseId: 10,
        description: 'Imported description updated',
        html: '<main><h1>Imported v2</h1><p>Updated.</p></main>',
      })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.draft.status).toBe('draft')

    const scanStatusResponse = await request(app)
      .get(`/sheets/drafts/${draftId}/scan-status`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')

    expect(scanStatusResponse.status).toBe(200)
    expect(typeof scanStatusResponse.body.status).toBe('string')

    const submitResponse = await request(app)
      .post(`/sheets/${draftId}/submit-review`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({})

    expect(submitResponse.status).toBe(200)
    expect(submitResponse.body.status).toBe('pending_review')
  })

  it('blocks submit when html content fails policy checks', async () => {
    const importResponse = await request(app)
      .post('/sheets/drafts/import-html')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Unsafe HTML',
        courseId: 10,
        description: 'unsafe draft',
        html: '<main><h1>Unsafe</h1></main>',
        sourceName: 'unsafe.html',
      })

    const draftId = importResponse.body.draft.id

    await request(app)
      .patch(`/sheets/drafts/${draftId}/working-html`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Unsafe HTML',
        courseId: 10,
        description: 'unsafe draft',
        html: '<main><script>alert(1)</script></main>',
      })

    const submitResponse = await request(app)
      .post(`/sheets/${draftId}/submit-review`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')

    expect(submitResponse.status).toBe(409)
    expect(submitResponse.body.error).toMatch(/Security scan must pass/i)
  })

  it('supports draft create, edit, and resume', async () => {
    const createResponse = await request(app)
      .post('/sheets/drafts/autosave')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Draft HTML sheet',
        courseId: 10,
        content: '<main><h1>Draft v1</h1></main>',
        contentFormat: 'html',
        description: 'draft one',
      })

    expect(createResponse.status).toBe(200)
    expect(createResponse.body.draft.status).toBe('draft')
    expect(createResponse.body.draft.contentFormat).toBe('html')

    const draftId = createResponse.body.draft.id

    const updateResponse = await request(app)
      .post('/sheets/drafts/autosave')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        id: draftId,
        title: 'Draft HTML sheet',
        courseId: 10,
        content: '<main><h1>Draft v2</h1><p>Updated.</p></main>',
        contentFormat: 'html',
        description: 'draft two',
      })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.draft.id).toBe(draftId)
    expect(updateResponse.body.draft.content).toContain('Draft v2')

    const resumeResponse = await request(app)
      .get('/sheets/drafts/latest')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')

    expect(resumeResponse.status).toBe(200)
    expect(resumeResponse.body.draft.id).toBe(draftId)
    expect(resumeResponse.body.draft.status).toBe('draft')
  })

  it('moves html sheet to pending_review and admin can approve or reject', async () => {
    const draftResponse = await request(app)
      .post('/sheets/drafts/autosave')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Review me',
        courseId: 10,
        content: '<main><h1>Submit me</h1></main>',
        contentFormat: 'html',
      })

    const draftId = draftResponse.body.draft.id

    const submitPendingResponse = await request(app)
      .patch(`/sheets/${draftId}`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Review me',
        courseId: 10,
        content: '<main><h1>Submit me</h1><p>Ready.</p></main>',
        contentFormat: 'html',
        status: 'pending_review',
      })

    expect(submitPendingResponse.status).toBe(200)
    expect(submitPendingResponse.body.status).toBe('pending_review')

    const approveResponse = await request(app)
      .patch(`/admin/sheets/${draftId}/review`)
      .set('x-test-user-id', '1')
      .set('x-test-role', 'admin')
      .send({ action: 'approve' })

    expect(approveResponse.status).toBe(200)
    expect(approveResponse.body.sheet.status).toBe('published')

    const secondDraftResponse = await request(app)
      .post('/sheets/drafts/autosave')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Reject me',
        courseId: 10,
        content: '<main><h1>Needs work</h1></main>',
        contentFormat: 'html',
      })

    const secondDraftId = secondDraftResponse.body.draft.id

    await request(app)
      .patch(`/sheets/${secondDraftId}`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({
        title: 'Reject me',
        courseId: 10,
        content: '<main><h1>Needs work</h1></main>',
        contentFormat: 'html',
        status: 'pending_review',
      })

    const rejectResponse = await request(app)
      .patch(`/admin/sheets/${secondDraftId}/review`)
      .set('x-test-user-id', '1')
      .set('x-test-role', 'admin')
      .send({ action: 'reject' })

    expect(rejectResponse.status).toBe(200)
    expect(rejectResponse.body.sheet.status).toBe('rejected')
  })
})
