/**
 * librarySync.test.js — weekly Google Books corpus sync.
 * Master plan §3.3 + L5-HIGH-5.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const targetPath = require.resolve('../src/modules/library/library.weeklySync.js')

const mocks = vi.hoisted(() => ({
  prisma: {
    librarySyncState: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    cachedBook: {
      upsert: vi.fn(),
    },
  },
  safeFetch: { safeFetch: vi.fn() },
  sentry: { captureError: vi.fn() },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/safeFetch'), mocks.safeFetch],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalLoad = Module._load
let mod

beforeAll(() => {
  Module._load = function patched(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    const mocked = mockTargets.get(resolved)
    if (mocked) return mocked
    return originalLoad.apply(this, arguments)
  }
})

afterAll(() => {
  Module._load = originalLoad
})

beforeEach(() => {
  vi.resetAllMocks()
  delete process.env.LIBRARY_SYNC_ENABLED
  // Default Prisma mocks return resolved promises so .catch() chains
  // in the production code don't throw on undefined.
  mocks.prisma.librarySyncState.update.mockResolvedValue({})
  mocks.prisma.cachedBook.upsert.mockResolvedValue({})
  // Re-import the module so the in-module backoff state is fresh.
  delete require.cache[targetPath]
  mod = require(targetPath)
})

afterEach(() => {
  delete require.cache[targetPath]
})

describe('kill-switch', () => {
  it('returns { killed: true } when LIBRARY_SYNC_ENABLED=false', async () => {
    process.env.LIBRARY_SYNC_ENABLED = 'false'
    const result = await mod.syncWeeklyCorpus()
    expect(result).toEqual({ killed: true })
    expect(mocks.prisma.librarySyncState.findMany).not.toHaveBeenCalled()
  })
})

describe('paginates from lastStartIndex', () => {
  it('advances startIndex by the page length', async () => {
    mocks.prisma.librarySyncState.findMany.mockResolvedValue([
      {
        id: 1,
        queryKey: 'subject:Mathematics',
        lastStartIndex: 40,
        totalFetched: 40,
        capDiscovered: false,
        lastRunAt: new Date('2025-01-01'),
      },
    ])
    mocks.safeFetch.safeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `vol-${i}`,
          volumeInfo: { title: `Title ${i}` },
        })),
        totalItems: 200,
      },
    })
    mocks.prisma.cachedBook.upsert.mockResolvedValue({})

    const result = await mod.syncWeeklyCorpus()

    expect(result.fetched).toBe(1)
    expect(result.items).toBe(20)
    const updateCall = mocks.prisma.librarySyncState.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 1 })
    expect(updateCall.data.lastStartIndex).toBe(60)
    expect(updateCall.data.capDiscovered).toBe(false)
  })
})

describe('respects capDiscovered + resetAt', () => {
  it('flips capDiscovered=true when upstream returned <DEFAULT_PAGE_SIZE rows', async () => {
    mocks.prisma.librarySyncState.findMany.mockResolvedValue([
      {
        id: 2,
        queryKey: 'subject:Drama',
        lastStartIndex: 980,
        totalFetched: 980,
        capDiscovered: false,
        lastRunAt: new Date('2025-01-01'),
      },
    ])
    mocks.safeFetch.safeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        items: [{ id: 'last', volumeInfo: { title: 'Last' } }],
        totalItems: 981,
      },
    })
    mocks.prisma.cachedBook.upsert.mockResolvedValue({})

    await mod.syncWeeklyCorpus()

    const updateCall = mocks.prisma.librarySyncState.update.mock.calls[0][0]
    expect(updateCall.data.capDiscovered).toBe(true)
    expect(updateCall.data.lastStartIndex).toBe(0)
    expect(updateCall.data.resetAt).toBeInstanceOf(Date)
  })
})

describe('exponential backoff on 429', () => {
  it('halts the loop and sets backoffUntil after a transient error', async () => {
    mocks.prisma.librarySyncState.findMany.mockResolvedValue([
      {
        id: 3,
        queryKey: 'subject:Physics',
        lastStartIndex: 0,
        totalFetched: 0,
        capDiscovered: false,
        lastRunAt: null,
      },
      {
        id: 4,
        queryKey: 'subject:History',
        lastStartIndex: 0,
        totalFetched: 0,
        capDiscovered: false,
        lastRunAt: null,
      },
    ])
    mocks.safeFetch.safeFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    })

    const result = await mod.syncWeeklyCorpus()
    // Only one fetch attempt was made before the backoff broke the loop.
    expect(result.fetched).toBe(1)
    expect(result.items).toBe(0)
    // No update written for either query (the transient handler bails).
    expect(mocks.prisma.librarySyncState.update).not.toHaveBeenCalled()
  })
})

describe('returns 0 picked when nothing eligible', () => {
  it('short-circuits with zero counters', async () => {
    mocks.prisma.librarySyncState.findMany.mockResolvedValue([])
    const result = await mod.syncWeeklyCorpus()
    expect(result).toEqual({ picked: 0, fetched: 0, items: 0 })
    expect(mocks.safeFetch.safeFetch).not.toHaveBeenCalled()
  })
})
