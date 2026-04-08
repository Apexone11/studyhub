import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const fullTextSearchPath = require.resolve('../src/lib/fullTextSearch')

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
])

const originalModuleLoad = Module._load
let fullTextSearch

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[fullTextSearchPath]
  fullTextSearch = require(fullTextSearchPath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[fullTextSearchPath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sanitizeSearchQuery', () => {
  it('strips tsquery operators and normalizes whitespace', () => {
    expect(fullTextSearch.sanitizeSearchQuery('  algebra | calculus:*  ')).toBe('algebra & calculus')
  })

  it('returns an empty string when nothing safe remains', () => {
    expect(fullTextSearch.sanitizeSearchQuery('@@@ !!!')).toBe('')
  })
})

describe('searchSheetsFTS', () => {
  it('uses structured $queryRaw calls instead of $queryRawUnsafe', async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([{ id: 101, title: 'Algebra Notes' }])

    const result = await fullTextSearch.searchSheetsFTS('algebra notes', {
      status: 'published',
      courseId: 12,
      userId: 8,
      page: 1,
      limit: 10,
    })

    expect(mocks.prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      total: 3,
      page: 1,
      totalPages: 1,
      sheets: [{ id: 101, title: 'Algebra Notes' }],
    })
  })
})
