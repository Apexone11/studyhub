/**
 * courseAliasing.test.js — G2-4 cross-school course-equivalence helpers.
 *
 * Pure-ish unit: the lib's only collaborators (prisma, evaluateFlag, logger)
 * are mocked through the Module._load monkey-patch so we exercise the real
 * slugify / isValidTag / fail-closed flag / fuzzy-fallback / dedupe logic.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const libPath = require.resolve('../src/lib/courseAliasing')

const mocks = vi.hoisted(() => {
  const prisma = {
    topicCanonical: { findUnique: vi.fn(), findMany: vi.fn() },
    courseAlias: { findMany: vi.fn(), groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  }
  return {
    prisma,
    featureFlags: { evaluateFlag: vi.fn() },
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/featureFlags'), mocks.featureFlags],
  [require.resolve('../src/lib/logger'), mocks.logger],
])

const originalModuleLoad = Module._load
let lib

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
  delete require.cache[libPath]
  lib = require(libPath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[libPath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

/* ── slugify ─────────────────────────────────────────────────────────── */
describe('slugify', () => {
  it("turns 'Intro Programming' into 'intro-programming'", () => {
    expect(lib.slugify('Intro Programming')).toBe('intro-programming')
  })

  it('collapses non-alnum runs and strips leading/trailing hyphens', () => {
    expect(lib.slugify('  CS 101!! ')).toBe('cs-101')
  })

  it('returns empty string for null/undefined', () => {
    expect(lib.slugify(null)).toBe('')
    expect(lib.slugify(undefined)).toBe('')
  })
})

/* ── isValidTag ──────────────────────────────────────────────────────── */
describe('isValidTag', () => {
  it("rejects whitespace/uppercase tags like 'Bad Tag'", () => {
    expect(lib.isValidTag('Bad Tag')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(lib.isValidTag('')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(lib.isValidTag(null)).toBe(false)
    expect(lib.isValidTag(123)).toBe(false)
  })

  it("accepts lowercase-hyphen tags like 'cs-intro'", () => {
    expect(lib.isValidTag('cs-intro')).toBe(true)
  })
})

/* ── isEnabled (fail-closed) ─────────────────────────────────────────── */
describe('isEnabled', () => {
  it('returns false when evaluateFlag throws (fail-closed)', async () => {
    mocks.featureFlags.evaluateFlag.mockRejectedValueOnce(new Error('flag store down'))
    expect(await lib.isEnabled()).toBe(false)
  })

  it('returns false when evaluateFlag resolves { enabled: false }', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValueOnce({ enabled: false, reason: 'DISABLED' })
    expect(await lib.isEnabled()).toBe(false)
  })

  it('returns true only on an explicit { enabled: true }', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValueOnce({ enabled: true, reason: 'ENABLED' })
    expect(await lib.isEnabled()).toBe(true)
  })
})

/* ── expandQueryToCourseIds ──────────────────────────────────────────── */
describe('expandQueryToCourseIds', () => {
  it('returns [] when the flag is off (no DB touch)', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValueOnce({ enabled: false })
    const ids = await lib.expandQueryToCourseIds('intro programming')
    expect(ids).toEqual([])
    expect(mocks.prisma.courseAlias.findMany).not.toHaveBeenCalled()
  })

  it('returns deduped courseIds with flag on + topic + aliases', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValue({ enabled: true })
    // resolveTopicTags: exact slug match hits topicCanonical.findUnique...
    mocks.prisma.topicCanonical.findUnique.mockResolvedValueOnce({ topicTag: 'intro-programming' })
    // ...and the fuzzy $queryRaw returns the same tag (deduped into the Set).
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ topicTag: 'intro-programming' }])
    // courseAlias.findMany returns duplicate courseIds → deduped to [11, 22].
    mocks.prisma.courseAlias.findMany.mockResolvedValueOnce([
      { courseId: 11 },
      { courseId: 22 },
      { courseId: 11 },
    ])

    const ids = await lib.expandQueryToCourseIds('Intro Programming', { userId: 1 })

    expect(ids.sort()).toEqual([11, 22])
    expect(mocks.prisma.courseAlias.findMany).toHaveBeenCalledWith({
      where: { topicTag: { in: ['intro-programming'] } },
      select: { courseId: true },
      take: 200,
    })
  })

  it('returns [] when the query resolves to no topics', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValue({ enabled: true })
    mocks.prisma.topicCanonical.findUnique.mockResolvedValueOnce(null)
    mocks.prisma.$queryRaw.mockResolvedValueOnce([])
    const ids = await lib.expandQueryToCourseIds('zzz nonexistent topic')
    expect(ids).toEqual([])
    expect(mocks.prisma.courseAlias.findMany).not.toHaveBeenCalled()
  })
})

/* ── resolveTopicTags fallback ───────────────────────────────────────── */
describe('resolveTopicTags', () => {
  it('falls back to ILIKE findMany when $queryRaw throws (pg_trgm missing)', async () => {
    mocks.prisma.topicCanonical.findUnique.mockResolvedValueOnce(null)
    mocks.prisma.$queryRaw.mockRejectedValueOnce(
      new Error('function similarity(text, text) does not exist'),
    )
    mocks.prisma.topicCanonical.findMany.mockResolvedValueOnce([{ topicTag: 'data-structures' }])

    const tags = await lib.resolveTopicTags('Data Structures')

    expect(tags).toEqual(['data-structures'])
    expect(mocks.prisma.topicCanonical.findMany).toHaveBeenCalledWith({
      where: { displayName: { contains: 'Data Structures', mode: 'insensitive' } },
      select: { topicTag: true },
      take: 5,
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'course_aliasing.trgm_unavailable' }),
      expect.any(String),
    )
  })

  it('returns [] for an empty query without querying', async () => {
    const tags = await lib.resolveTopicTags('   ')
    expect(tags).toEqual([])
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled()
  })
})

/* ── getEquivalentCourses ────────────────────────────────────────────── */
describe('getEquivalentCourses', () => {
  it('returns [] for a non-positive courseId', async () => {
    expect(await lib.getEquivalentCourses(0)).toEqual([])
    expect(await lib.getEquivalentCourses(-3)).toEqual([])
    expect(mocks.featureFlags.evaluateFlag).not.toHaveBeenCalled()
  })

  it('returns [] when the flag is off', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValueOnce({ enabled: false })
    expect(await lib.getEquivalentCourses(5)).toEqual([])
    expect(mocks.prisma.courseAlias.findMany).not.toHaveBeenCalled()
  })

  it('excludes the source courseId and annotates each sibling with its topics', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValue({ enabled: true })
    // course 5's own topics
    mocks.prisma.courseAlias.findMany
      .mockResolvedValueOnce([{ topicTag: 'cs-intro' }, { topicTag: 'cs-intro' }])
      // siblings sharing those topics (source course 5 excluded by the query NOT clause)
      .mockResolvedValueOnce([
        {
          topicTag: 'cs-intro',
          course: { id: 7, code: 'CS61A', name: 'SICP', school: { id: 2, name: 'Cal' } },
        },
        {
          topicTag: 'cs-intro',
          course: { id: 9, code: '6.0001', name: 'Intro', school: { id: 3, name: 'MIT' } },
        },
      ])
    mocks.prisma.topicCanonical.findMany.mockResolvedValueOnce([
      { topicTag: 'cs-intro', displayName: 'Intro to CS' },
    ])

    const equivalents = await lib.getEquivalentCourses(5, { userId: 1 })

    expect(equivalents.map((e) => e.id).sort()).toEqual([7, 9])
    expect(equivalents.every((e) => e.id !== 5)).toBe(true)
    const cal = equivalents.find((e) => e.id === 7)
    expect(cal).toMatchObject({
      code: 'CS61A',
      name: 'SICP',
      school: { id: 2, name: 'Cal' },
      topics: [{ topicTag: 'cs-intro', displayName: 'Intro to CS' }],
    })
    // The NOT-self constraint is passed to Prisma.
    expect(mocks.prisma.courseAlias.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ NOT: [{ courseId: 5 }] }),
      }),
    )
  })

  it('returns [] (no throw) when a Prisma query rejects', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValue({ enabled: true })
    mocks.prisma.courseAlias.findMany.mockRejectedValueOnce(new Error('db down'))
    expect(await lib.getEquivalentCourses(5)).toEqual([])
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'course_aliasing.equivalents_failed' }),
      expect.any(String),
    )
  })
})

/* ── listTopics ──────────────────────────────────────────────────────── */
describe('listTopics', () => {
  it('returns [] when the flag is off', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValueOnce({ enabled: false })
    expect(await lib.listTopics()).toEqual([])
    expect(mocks.prisma.topicCanonical.findMany).not.toHaveBeenCalled()
  })

  it('annotates each topic with its course count (0 when absent)', async () => {
    mocks.featureFlags.evaluateFlag.mockResolvedValue({ enabled: true })
    mocks.prisma.topicCanonical.findMany.mockResolvedValueOnce([
      { topicTag: 'cs-intro', displayName: 'Intro to CS', category: 'cs', cipCode: '11.0701' },
      { topicTag: 'calc-1', displayName: 'Calculus I', category: 'math', cipCode: '27.0101' },
    ])
    mocks.prisma.courseAlias.groupBy.mockResolvedValueOnce([
      { topicTag: 'cs-intro', _count: { courseId: 4 } },
    ])

    const topics = await lib.listTopics({ userId: 1 })

    expect(topics).toEqual([
      {
        topicTag: 'cs-intro',
        displayName: 'Intro to CS',
        category: 'cs',
        cipCode: '11.0701',
        courseCount: 4,
      },
      {
        topicTag: 'calc-1',
        displayName: 'Calculus I',
        category: 'math',
        cipCode: '27.0101',
        courseCount: 0,
      },
    ])
  })
})
