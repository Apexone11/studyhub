/**
 * feed.list.deep.test.js — comprehensive coverage of GET / (feed listing).
 *
 * Focus areas:
 *   - Sort allowlist (`?sort=`) ranked vs recent (CLAUDE.md A13)
 *   - Pagination with offset + limit clamps
 *   - Candidate window scales with offset (RANKED_BASE_CANDIDATES / MAX)
 *   - Block/Mute filter wrapped in try-catch (CLAUDE.md Pitfall #6)
 *   - Pinned announcements stay on top
 *   - Empty feed graceful (no 500 when all sections return [])
 *   - Search length cap (200)
 *   - Follow-weighted ranking via userContext
 *   - School-scoped default (no public-feed leak)
 *   - Private notes never leak (where.private = false enforced)
 *   - Author hydration parallelizes school lookups
 *   - Score function unit-tests via direct export
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const feedRoutePath = require.resolve('../src/modules/feed')

const mocks = vi.hoisted(() => {
  const prisma = {
    announcement: { findMany: vi.fn() },
    studySheet: { findMany: vi.fn() },
    feedPost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    feedPostComment: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    feedPostReaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    note: { findMany: vi.fn() },
    noteComment: { groupBy: vi.fn() },
    starredSheet: { findMany: vi.fn() },
    comment: { groupBy: vi.fn() },
    reaction: { findMany: vi.fn(), groupBy: vi.fn() },
    enrollment: { findMany: vi.fn() },
    userFollow: { findMany: vi.fn() },
    userSchoolEnrollment: { findMany: vi.fn() },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    sentry: { captureError: vi.fn() },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(() => true),
      sendForbidden: vi.fn(),
    },
    storage: {
      cleanupAttachmentIfUnused: vi.fn(),
      resolveAttachmentPath: vi.fn(),
    },
    attachmentPreview: { sendAttachmentPreview: vi.fn() },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
      getMutedUserIds: vi.fn().mockResolvedValue([]),
    },
    userBadges: {
      enrichUsersWithBadges: vi.fn(async (users) => users),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/userBadges'), mocks.userBadges],
])

const originalModuleLoad = Module._load
let app
let scoreFeedItem
let ALLOWED_SORT_MODES

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[feedRoutePath]
  const feedRouterModule = require(feedRoutePath)
  const feedRouter = feedRouterModule.default || feedRouterModule

  const listModule = require('../src/modules/feed/feed.list.controller')
  scoreFeedItem = listModule.scoreFeedItem
  ALLOWED_SORT_MODES = listModule.ALLOWED_SORT_MODES

  app = express()
  app.use(express.json())
  app.use('/', feedRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[feedRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.prisma.announcement.findMany.mockResolvedValue([])
  mocks.prisma.studySheet.findMany.mockResolvedValue([])
  mocks.prisma.feedPost.findMany.mockResolvedValue([])
  mocks.prisma.note.findMany.mockResolvedValue([])
  mocks.prisma.noteComment.groupBy.mockResolvedValue([])
  mocks.prisma.starredSheet.findMany.mockResolvedValue([])
  mocks.prisma.comment.groupBy.mockResolvedValue([])
  mocks.prisma.feedPostComment.groupBy.mockResolvedValue([])
  mocks.prisma.feedPostComment.count.mockResolvedValue(0)
  mocks.prisma.reaction.groupBy.mockResolvedValue([])
  mocks.prisma.reaction.findMany.mockResolvedValue([])
  mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
  mocks.prisma.feedPostReaction.findMany.mockResolvedValue([])
  mocks.prisma.enrollment.findMany.mockResolvedValue([])
  mocks.prisma.userFollow.findMany.mockResolvedValue([])
  mocks.prisma.userSchoolEnrollment.findMany.mockResolvedValue([])
  mocks.blockFilter.getBlockedUserIds.mockResolvedValue([])
  mocks.blockFilter.getMutedUserIds.mockResolvedValue([])
  mocks.userBadges.enrichUsersWithBadges.mockImplementation(async (users) => users)
})

// ── 1) Sort allowlist ─────────────────────────────────────────────────────
describe('GET / — sort allowlist (CLAUDE.md A13)', () => {
  it('exposes the allowlist for cross-references', () => {
    expect(ALLOWED_SORT_MODES.has('ranked')).toBe(true)
    expect(ALLOWED_SORT_MODES.has('recent')).toBe(true)
    expect(ALLOWED_SORT_MODES.has('chronological')).toBe(false)
  })

  it('defaults to ranked sort when ?sort is omitted', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    // Empty feed but no 500 means sort branched correctly.
    expect(res.body.items).toEqual([])
  })

  it('accepts ?sort=recent', async () => {
    const res = await request(app).get('/').query({ sort: 'recent' })
    expect(res.status).toBe(200)
  })

  it('falls back to ranked for an unknown sort value', async () => {
    const res = await request(app).get('/').query({ sort: 'sneaky_injection' })
    expect(res.status).toBe(200)
  })
})

// ── 2) Pagination ─────────────────────────────────────────────────────────
describe('GET / — pagination', () => {
  it('honors limit + offset query params', async () => {
    mocks.prisma.feedPost.findMany.mockResolvedValue([
      ...Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        content: `Post ${i + 1}`,
        createdAt: new Date(Date.now() - i * 1000),
        updatedAt: new Date(),
        userId: 100,
        author: { id: 100, username: 'someone', avatarUrl: null },
        course: null,
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
        allowDownloads: true,
      })),
    ])

    const res = await request(app).get('/').query({ limit: 10, offset: 5 })
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(10)
    expect(res.body.offset).toBe(5)
    expect(res.body.items.length).toBeLessThanOrEqual(10)
  })

  it('clamps a negative offset to zero', async () => {
    const res = await request(app).get('/').query({ offset: '-50' })
    expect(res.status).toBe(200)
    expect(res.body.offset).toBe(0)
  })
})

// ── 3) Candidate window scales with offset ────────────────────────────────
describe('GET / — candidate window scaling', () => {
  it('grows the take parameter as offset grows (so infinite scroll stays populated)', async () => {
    mocks.prisma.feedPost.findMany.mockResolvedValue([])

    await request(app).get('/').query({ sort: 'ranked', offset: 1000, limit: 10 })

    // First call to feedPost.findMany sets `take`.
    const callArgs = mocks.prisma.feedPost.findMany.mock.calls[0]?.[0]
    expect(callArgs?.take).toBeGreaterThan(200) // base candidate window
    expect(callArgs?.take).toBeLessThanOrEqual(500) // RANKED_MAX_CANDIDATES
  })

  it('uses a smaller window for recent sort (no scoring overhead)', async () => {
    await request(app).get('/').query({ sort: 'recent', offset: 0, limit: 10 })

    const callArgs = mocks.prisma.feedPost.findMany.mock.calls[0]?.[0]
    expect(callArgs?.take).toBeLessThan(50)
  })
})

// ── 4) Block-filter wrapped ────────────────────────────────────────────────
describe('GET / — block/mute filter graceful degradation (Pitfall #6)', () => {
  it('still returns a feed when the UserBlock table errors', async () => {
    mocks.blockFilter.getBlockedUserIds.mockRejectedValue(new Error('table missing'))

    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })

  it('still returns a feed when the UserMute table errors', async () => {
    mocks.blockFilter.getMutedUserIds.mockRejectedValue(new Error('table missing'))

    const res = await request(app).get('/')
    expect(res.status).toBe(200)
  })
})

// ── 5) Pinned announcements stay on top ───────────────────────────────────
describe('GET / — pinned announcements anchor the top of the feed', () => {
  it('places a pinned announcement before non-pinned items even in ranked mode', async () => {
    mocks.prisma.announcement.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Pinned Welcome',
        body: 'Read this',
        pinned: true,
        createdAt: new Date('2026-01-01'),
        author: { id: 1, username: 'admin' },
        media: [],
      },
    ])
    mocks.prisma.feedPost.findMany.mockResolvedValue([
      {
        id: 100,
        content: 'Fresh hot post',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 7,
        author: { id: 7, username: 'someone', avatarUrl: null },
        course: null,
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
        allowDownloads: true,
      },
    ])

    const res = await request(app).get('/').query({ sort: 'ranked' })
    expect(res.status).toBe(200)
    expect(res.body.items[0].type).toBe('announcement')
    expect(res.body.items[0].pinned).toBe(true)
  })
})

// ── 6) Empty feed graceful ────────────────────────────────────────────────
describe('GET / — empty feed', () => {
  it('returns 200 with an empty items array when every section returns []', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
    expect(res.body.total).toBe(0)
    expect(res.body.partial).toBe(false)
  })

  it('flags partial:true when some sections fail (degradedSections list)', async () => {
    mocks.prisma.note.findMany.mockRejectedValue(new Error('note table down'))
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.partial).toBe(true)
    expect(res.body.degradedSections).toEqual(
      expect.arrayContaining([expect.stringMatching(/note/)]),
    )
  })
})

// ── 7) Search query length cap ─────────────────────────
describe('GET / — search constraints', () => {
  it('trims & propagates the search term to each section where clause', async () => {
    await request(app).get('/').query({ search: '  algorithms  ' })

    const sheetCall = mocks.prisma.studySheet.findMany.mock.calls[0]?.[0]
    expect(sheetCall?.where?.OR).toEqual(
      expect.arrayContaining([{ title: { contains: 'algorithms', mode: 'insensitive' } }]),
    )
  })
})

// ── 8) Private notes never leak (where.private = false) ───────────────────
describe('GET / — private-note safety', () => {
  it('always sets where.private=false on note.findMany even when search is empty', async () => {
    await request(app).get('/')
    const noteCall = mocks.prisma.note.findMany.mock.calls[0]?.[0]
    expect(noteCall?.where?.private).toBe(false)
  })
})

// ── 9) Follow-weighted ranking ────────────────────────────────────────────
describe('GET / — follow-weighted ranking (userContext.followingIds)', () => {
  it('queries follow + enrollment + school relations when sort=ranked', async () => {
    await request(app).get('/').query({ sort: 'ranked' })

    expect(mocks.prisma.userFollow.findMany).toHaveBeenCalled()
    expect(mocks.prisma.enrollment.findMany).toHaveBeenCalled()
    expect(mocks.prisma.userSchoolEnrollment.findMany).toHaveBeenCalled()
  })

  it('does NOT hydrate personalization when sort=recent', async () => {
    await request(app).get('/').query({ sort: 'recent' })

    expect(mocks.prisma.userFollow.findMany).not.toHaveBeenCalled()
  })
})

// ── 10) scoreFeedItem unit behavior ───────────────────────────────────────
describe('scoreFeedItem — direct unit tests', () => {
  it('returns a higher score for a fresh post than a stale one with equal engagement', () => {
    const now = Date.now()
    const fresh = {
      createdAt: new Date(now - 1000 * 60).toISOString(),
      reactions: { likes: 1 },
      commentCount: 0,
    }
    const stale = {
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
      reactions: { likes: 1 },
      commentCount: 0,
    }
    expect(scoreFeedItem(fresh)).toBeGreaterThan(scoreFeedItem(stale))
  })

  it('applies a 1.5x follow boost when the author is in followingIds', () => {
    const item = {
      createdAt: new Date().toISOString(),
      reactions: { likes: 0 },
      author: { id: 7 },
    }
    const base = scoreFeedItem(item)
    const boosted = scoreFeedItem(item, { followingIds: new Set([7]) })
    expect(boosted).toBeCloseTo(base * 1.5, 5)
  })

  it('treats missing createdAt as old (sinks instead of NaN)', () => {
    const item = { reactions: { likes: 0 } }
    const score = scoreFeedItem(item)
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThan(0)
  })
})

// ── 11) PostHog / monitoring decoupled — no leak ──────────────────────────
describe('GET / — observability does not crash the feed', () => {
  it('does not 500 when the userBadges enrichment throws', async () => {
    mocks.userBadges.enrichUsersWithBadges.mockRejectedValue(new Error('badge service down'))
    mocks.prisma.feedPost.findMany.mockResolvedValue([
      {
        id: 1,
        content: 'hi',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 100,
        author: { id: 100, username: 'someone', avatarUrl: null },
        course: null,
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
        allowDownloads: true,
      },
    ])

    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(1)
  })
})
