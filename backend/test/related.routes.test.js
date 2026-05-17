/**
 * related.routes.test.js — Vitest coverage for the cross-surface
 * "Related work" endpoints (wave-12.3 ecosystem Track 5).
 *
 * Uses the Node module-loader patch to swap in a fake Prisma. The
 * router itself is exercised through Express + Supertest so we cover
 * the actual route definitions + middleware wiring.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const routerPath = require.resolve('../src/modules/related/related.routes')

const fakeData = {
  sheets: [],
  notes: [],
  blocked: new Set(),
  sheetById: new Map(),
  noteById: new Map(),
}

const prismaMock = {
  studySheet: {
    findUnique: vi.fn(async ({ where }) => fakeData.sheetById.get(where.id) || null),
    findMany: vi.fn(async ({ where, take }) => {
      const rows = fakeData.sheets.filter((s) => {
        if (where?.id?.not != null && s.id === where.id.not) return false
        if (where?.courseId != null && s.courseId !== where.courseId) return false
        if (where?.status != null && s.status !== where.status) return false
        if (where?.libraryVolumeId != null && s.libraryVolumeId !== where.libraryVolumeId) {
          return false
        }
        if (
          where?.derivedFromPaperId != null &&
          s.derivedFromPaperId !== where.derivedFromPaperId
        ) {
          return false
        }
        if (where?.userId?.notIn && where.userId.notIn.includes(s.userId)) return false
        return true
      })
      return rows.slice(0, take || 50)
    }),
  },
  note: {
    findUnique: vi.fn(async ({ where }) => fakeData.noteById.get(where.id) || null),
    findMany: vi.fn(async ({ where, take }) => {
      const rows = fakeData.notes.filter((n) => {
        if (where?.id?.not != null && n.id === where.id.not) return false
        if (where?.private === false && n.private !== false) return false
        if (where?.relatedSheetId != null && n.relatedSheetId !== where.relatedSheetId) {
          return false
        }
        if (where?.relatedPaperId != null && n.relatedPaperId !== where.relatedPaperId) {
          return false
        }
        if (
          where?.userId != null &&
          typeof where.userId === 'number' &&
          n.userId !== where.userId
        ) {
          return false
        }
        if (where?.userId?.notIn && where.userId.notIn.includes(n.userId)) return false
        if (where?.courseId != null && n.courseId !== where.courseId) return false
        return true
      })
      return rows.slice(0, take || 50)
    }),
  },
  userBlock: {
    findMany: vi.fn(async () => []),
  },
}

const fakeOptionalAuth = (req, _res, next) => {
  const id = req.headers['x-test-user-id']
  if (id) req.user = { userId: Number(id) }
  next()
}

const originalLoad = Module._load
let app

function pathEndsWith(resolved, suffix) {
  // Normalize Windows backslashes so the suffix-match works on both OSes.
  const norm = resolved.replace(/\\/g, '/')
  return norm.endsWith(suffix)
}

beforeAll(() => {
  Module._load = function patched(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      if (pathEndsWith(resolved, 'lib/prisma.js') || pathEndsWith(resolved, 'core/db/prisma.js')) {
        return prismaMock
      }
      if (pathEndsWith(resolved, 'core/auth/optionalAuth.js')) {
        return fakeOptionalAuth
      }
      if (pathEndsWith(resolved, 'monitoring/sentry.js')) {
        return { captureError: () => {} }
      }
      if (pathEndsWith(resolved, 'lib/cacheControl.js')) {
        return { cacheControl: () => (_req, _res, next) => next() }
      }
      if (pathEndsWith(resolved, 'middleware/errorEnvelope.js')) {
        return {
          sendError: (res, status, message, code) =>
            res.status(status).json({ error: message, code }),
          ERROR_CODES: {
            BAD_REQUEST: 'BAD_REQUEST',
            NOT_FOUND: 'NOT_FOUND',
            INTERNAL: 'INTERNAL',
          },
        }
      }
      if (pathEndsWith(resolved, 'lib/social/blockFilter.js')) {
        return {
          getBlockedUserIds: async () => Array.from(fakeData.blocked),
        }
      }
    } catch {
      /* fall through to default loader */
    }
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[routerPath]
  const router = require(routerPath)
  app = express()
  app.use(express.json())
  app.use('/api/related', router)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[routerPath]
})

beforeEach(() => {
  fakeData.sheets = []
  fakeData.notes = []
  fakeData.blocked = new Set()
  fakeData.sheetById.clear()
  fakeData.noteById.clear()
  vi.clearAllMocks()
})

describe('GET /api/related/sheet/:id', () => {
  it('returns 400 for invalid id', async () => {
    const res = await request(app).get('/api/related/sheet/abc')
    expect(res.status).toBe(400)
  })

  it('returns empty when the sheet does not exist', async () => {
    const res = await request(app).get('/api/related/sheet/999')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })

  it('returns sibling sheets in the same course', async () => {
    fakeData.sheetById.set(1, { id: 1, courseId: 10, libraryVolumeId: null })
    fakeData.sheets.push(
      {
        id: 1,
        courseId: 10,
        status: 'published',
        stars: 0,
        userId: 100,
        author: { username: 'a' },
        title: 'self',
      },
      {
        id: 2,
        courseId: 10,
        status: 'published',
        stars: 5,
        userId: 101,
        author: { username: 'b' },
        title: 'sibling',
        previewText: '',
      },
    )
    const res = await request(app).get('/api/related/sheet/1')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({
      type: 'sheet',
      id: 2,
      title: 'sibling',
      href: '/sheets/2',
    })
  })

  it('excludes self from sibling list', async () => {
    fakeData.sheetById.set(1, { id: 1, courseId: 10 })
    fakeData.sheets.push({
      id: 1,
      courseId: 10,
      status: 'published',
      stars: 0,
      userId: 100,
      author: { username: 'a' },
      title: 'self',
    })
    const res = await request(app).get('/api/related/sheet/1')
    expect(res.body.items).toEqual([])
  })

  it('includes backlink notes that point at the sheet', async () => {
    fakeData.sheetById.set(1, { id: 1, courseId: 10 })
    fakeData.notes.push({
      id: 50,
      relatedSheetId: 1,
      private: false,
      userId: 200,
      author: { username: 'note-author' },
      title: 'My note about sheet 1',
    })
    const res = await request(app).get('/api/related/sheet/1')
    const noteItem = res.body.items.find((i) => i.type === 'note')
    expect(noteItem).toBeDefined()
    expect(noteItem.title).toBe('My note about sheet 1')
    expect(noteItem.href).toBe('/notes/50')
  })

  it('caps results at 8 total items', async () => {
    fakeData.sheetById.set(1, { id: 1, courseId: 10 })
    for (let i = 2; i <= 15; i++) {
      fakeData.sheets.push({
        id: i,
        courseId: 10,
        status: 'published',
        stars: i,
        userId: 100 + i,
        author: { username: `u${i}` },
        title: `S${i}`,
      })
    }
    const res = await request(app).get('/api/related/sheet/1')
    expect(res.body.items.length).toBeLessThanOrEqual(8)
  })
})

describe('GET /api/related/note/:id', () => {
  it('returns the linked sheet + sibling notes', async () => {
    fakeData.noteById.set(7, {
      id: 7,
      userId: 200,
      courseId: 99,
      relatedSheetId: 11,
      relatedPaperId: null,
    })
    fakeData.sheetById.set(11, {
      id: 11,
      title: 'Linked sheet',
      author: { username: 'linker' },
    })
    fakeData.notes.push({
      id: 8,
      userId: 200,
      courseId: 99,
      private: false,
      title: 'Sibling note',
    })
    const res = await request(app).get('/api/related/note/7')
    expect(res.status).toBe(200)
    const sheetItem = res.body.items.find((i) => i.type === 'sheet')
    expect(sheetItem?.title).toBe('Linked sheet')
    const noteItem = res.body.items.find((i) => i.type === 'note')
    expect(noteItem?.title).toBe('Sibling note')
  })
})

describe('GET /api/related/paper/:paperId', () => {
  it('returns sheets derived from the paper', async () => {
    fakeData.sheets.push({
      id: 22,
      derivedFromPaperId: 'p_abc',
      status: 'published',
      userId: 300,
      author: { username: 'gen' },
      title: 'AI-generated from p_abc',
    })
    const res = await request(app).get('/api/related/paper/p_abc')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].title).toBe('AI-generated from p_abc')
  })
})

describe('GET /api/related/book/:volumeId', () => {
  it('returns sheets that link to the book volumeId', async () => {
    fakeData.sheets.push({
      id: 33,
      libraryVolumeId: 'vol_xyz',
      status: 'published',
      userId: 400,
      author: { username: 'lib' },
      title: 'Notes on Calculus by Stewart',
    })
    const res = await request(app).get('/api/related/book/vol_xyz')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].title).toBe('Notes on Calculus by Stewart')
  })

  it('returns empty when no sheets link to the book', async () => {
    const res = await request(app).get('/api/related/book/no_matches')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })
})
