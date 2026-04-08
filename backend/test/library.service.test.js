import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const libraryServicePath = require.resolve('../src/modules/library/library.service')

const mocks = vi.hoisted(() => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
  },
  prisma: {
    cachedBook: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  sentry: {
    captureError: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/modules/library/library.cache'), mocks.cache],
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load
let libraryService

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[libraryServicePath]
  libraryService = require(libraryServicePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[libraryServicePath]
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cache.get.mockReturnValue(undefined)
  mocks.prisma.cachedBook.findMany.mockResolvedValue([])
  mocks.prisma.cachedBook.count.mockResolvedValue(0)
})

describe('searchBooks', () => {
  it('passes HTTP status metadata into sentry capture for Google Books failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    const result = await libraryService.searchBooks('algebra', 2, { language: 'en' })

    expect(result).toEqual({ results: [], count: 0, _unavailable: true })
    expect(mocks.sentry.captureError).toHaveBeenCalledTimes(1)

    const [error, context] = mocks.sentry.captureError.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect(error.statusCode).toBe(429)
    expect(context).toMatchObject({
      context: 'searchBooks',
      query: 'algebra',
      page: 2,
      statusCode: 429,
    })
  })
})
