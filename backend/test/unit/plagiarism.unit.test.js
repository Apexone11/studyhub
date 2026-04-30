import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../../src/lib/plagiarismService')
const fingerprintPath = require.resolve('../../src/lib/contentFingerprint')

const mocks = vi.hoisted(() => {
  const prisma = {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    note: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  }

  const sentry = {
    captureError: vi.fn(),
  }

  return { prisma, sentry }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load

let plagiarismService
let fingerprintLib

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const mocked = mockTargets.get(resolved)
      if (mocked) return mocked
    } catch {
      // fall through
    }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[servicePath]
  delete require.cache[fingerprintPath]

  fingerprintLib = require(fingerprintPath)
  plagiarismService = require(servicePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[servicePath]
  delete require.cache[fingerprintPath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

/* ===================================================================== */
/* Pure algorithm: contentFingerprint                                     */
/* ===================================================================== */
describe('contentFingerprint.normalizeText', () => {
  it('lowercases, strips HTML, punctuation, and collapses whitespace', () => {
    const input = '<p>Hello,   WORLD!</p>\n\nThis is <b>BOLD</b>.'
    expect(fingerprintLib.normalizeText(input)).toBe('hello world this is bold')
  })

  it('returns empty string for null/undefined/empty input', () => {
    expect(fingerprintLib.normalizeText(null)).toBe('')
    expect(fingerprintLib.normalizeText(undefined)).toBe('')
    expect(fingerprintLib.normalizeText('')).toBe('')
    expect(fingerprintLib.normalizeText('   \t\n  ')).toBe('')
  })
})

describe('contentFingerprint.exactHash', () => {
  it('produces identical SHA-256 for identical normalized content', () => {
    const a = fingerprintLib.exactHash('The quick brown fox jumps over the lazy dog.')
    const b = fingerprintLib.exactHash('the QUICK   brown  fox jumps over the LAZY dog!!!')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different hashes for different content', () => {
    const a = fingerprintLib.exactHash('hello world')
    const b = fingerprintLib.exactHash('goodbye world')
    expect(a).not.toBe(b)
  })

  it('returns null for empty/whitespace-only input', () => {
    expect(fingerprintLib.exactHash('')).toBeNull()
    expect(fingerprintLib.exactHash('   \n\t  ')).toBeNull()
  })
})

describe('contentFingerprint.simhash', () => {
  it('produces a 16-char hex string fingerprint', () => {
    const fp = fingerprintLib.simhash(
      'The quick brown fox jumps over the lazy dog every morning in the forest',
    )
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns null for empty/whitespace-only input', () => {
    expect(fingerprintLib.simhash('')).toBeNull()
    expect(fingerprintLib.simhash('   ')).toBeNull()
  })

  it('handles very short inputs (fewer words than shingle size)', () => {
    const fp = fingerprintLib.simhash('hi')
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('produces identical fingerprints for identical content', () => {
    const text =
      'Photosynthesis converts sunlight into chemical energy stored in glucose molecules for plants.'
    expect(fingerprintLib.simhash(text)).toBe(fingerprintLib.simhash(text))
  })
})

describe('contentFingerprint.similarity', () => {
  it('returns 1.0 for identical content (similarity = 1.0)', () => {
    const text =
      'Mitochondria are the powerhouse of the cell and generate ATP through oxidative phosphorylation.'
    const a = fingerprintLib.simhash(text)
    const b = fingerprintLib.simhash(text)
    expect(fingerprintLib.similarity(a, b)).toBe(1.0)
  })

  it('scores near-duplicates high (minor edits should still be > 0.70)', () => {
    const a = fingerprintLib.simhash(
      'Photosynthesis converts sunlight into chemical energy stored in glucose molecules. ' +
        'Plants use this process to grow and produce oxygen as a byproduct. ' +
        'Chlorophyll in the leaves captures light energy from the sun.',
    )
    const b = fingerprintLib.simhash(
      'Photosynthesis converts sunlight into chemical energy stored in glucose molecules. ' +
        'Plants use this process to grow and produce oxygen as a byproduct today. ' +
        'Chlorophyll in the leaves captures light energy from the sun.',
    )
    const sim = fingerprintLib.similarity(a, b)
    expect(sim).toBeGreaterThan(0.7)
    expect(sim).toBeLessThan(1.0)
  })

  it('scores completely different content lower than near-duplicates', () => {
    const a = fingerprintLib.simhash(
      'The French Revolution was a period of radical political and societal change in France ' +
        'that began with the Estates General of 1789 and ended with the formation of the French Consulate in November 1799.',
    )
    const b = fingerprintLib.simhash(
      'Quantum entanglement is a physical phenomenon that occurs when a group of particles ' +
        'are generated or interact in ways such that the quantum state cannot be described independently.',
    )
    const sim = fingerprintLib.similarity(a, b)
    expect(sim).toBeLessThan(0.7)
  })

  it('returns 0 when either fingerprint is null (hamming = 64)', () => {
    const a = fingerprintLib.simhash('some arbitrary content with enough words for shingling')
    expect(fingerprintLib.similarity(a, null)).toBe(0)
    expect(fingerprintLib.similarity(null, a)).toBe(0)
    expect(fingerprintLib.similarity(null, null)).toBe(0)
  })
})

describe('contentFingerprint.fingerprint', () => {
  it('returns exactHash, simhash, and wordCount together', () => {
    const fp = fingerprintLib.fingerprint(
      'The mitochondria are the powerhouse of the cell and produce ATP.',
    )
    expect(fp.exactHash).toMatch(/^[0-9a-f]{64}$/)
    expect(fp.simhash).toMatch(/^[0-9a-f]{16}$/)
    expect(fp.wordCount).toBe(11)
  })

  it('returns null hashes and zero wordCount for empty input', () => {
    const fp = fingerprintLib.fingerprint('')
    expect(fp.exactHash).toBeNull()
    expect(fp.simhash).toBeNull()
    expect(fp.wordCount).toBe(0)
  })
})

/* ===================================================================== */
/* Thresholding constants                                                 */
/* ===================================================================== */
describe('plagiarismService thresholds', () => {
  it('exports SIMILARITY_THRESHOLD at 0.70 (suspicious) and LIKELY_COPY_THRESHOLD at 0.85', () => {
    expect(plagiarismService.SIMILARITY_THRESHOLD).toBe(0.7)
    expect(plagiarismService.LIKELY_COPY_THRESHOLD).toBe(0.85)
    expect(plagiarismService.LIKELY_COPY_THRESHOLD).toBeGreaterThan(
      plagiarismService.SIMILARITY_THRESHOLD,
    )
  })
})

/* ===================================================================== */
/* updateFingerprint                                                      */
/* ===================================================================== */
describe('plagiarismService.updateFingerprint', () => {
  it('skips update when text is shorter than 20 characters', async () => {
    await plagiarismService.updateFingerprint('sheet', 1, 'short')
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
    expect(mocks.prisma.note.update).not.toHaveBeenCalled()
  })

  it('skips update when text is null or empty', async () => {
    await plagiarismService.updateFingerprint('sheet', 1, null)
    await plagiarismService.updateFingerprint('sheet', 1, '')
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('writes exactHash and simhash to studySheet when contentType is sheet', async () => {
    mocks.prisma.studySheet.update.mockResolvedValue({ id: 1 })
    const text = 'The quick brown fox jumps over the lazy dog every single morning of the year.'

    await plagiarismService.updateFingerprint('sheet', 1, text)

    expect(mocks.prisma.studySheet.update).toHaveBeenCalledTimes(1)
    const call = mocks.prisma.studySheet.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 1 })
    expect(call.data.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(call.data.contentSimhash).toMatch(/^[0-9a-f]{16}$/)
    expect(mocks.prisma.note.update).not.toHaveBeenCalled()
  })

  it('writes fingerprints to note table when contentType is note', async () => {
    mocks.prisma.note.update.mockResolvedValue({ id: 5 })
    const text = 'Photosynthesis converts light energy into chemical energy in plant cells always.'

    await plagiarismService.updateFingerprint('note', 5, text)

    expect(mocks.prisma.note.update).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.note.update.mock.calls[0][0].where).toEqual({ id: 5 })
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('swallows prisma errors via captureError (graceful degradation)', async () => {
    mocks.prisma.studySheet.update.mockRejectedValue(new Error('db offline'))
    const text = 'The quick brown fox jumps over the lazy dog every single morning of the year.'

    await expect(plagiarismService.updateFingerprint('sheet', 1, text)).resolves.toBeUndefined()
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})

/* ===================================================================== */
/* findSimilarContent                                                     */
/* ===================================================================== */
describe('plagiarismService.findSimilarContent', () => {
  it('returns [] when the reported record does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 999,
    })

    expect(result).toEqual([])
  })

  it('returns [] when reported content has no text', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      content: null,
      contentHash: null,
      contentSimhash: null,
      createdAt: new Date(),
    })

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
    })

    expect(result).toEqual([])
  })

  it('detects exact-hash matches as similarity 1.0 with isExactMatch true', async () => {
    const text = 'The mitochondria are the powerhouse of the cell and produce ATP for the body.'
    const fp = fingerprintLib.fingerprint(text)

    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      content: text,
      contentHash: fp.exactHash,
      contentSimhash: fp.simhash,
      createdAt: new Date('2026-01-01'),
    })

    mocks.prisma.studySheet.findMany
      // Lineage BFS query (no descendants for this test)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 2,
          title: 'Copied Sheet',
          userId: 20,
          createdAt: new Date('2026-02-01'),
          contentSimhash: fp.simhash,
          author: { id: 20, username: 'copier' },
        },
      ])
      .mockResolvedValueOnce([])
    mocks.prisma.note.findMany.mockResolvedValue([]).mockResolvedValue([])

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
    })

    expect(result.length).toBeGreaterThanOrEqual(1)
    const exact = result.find((m) => m.type === 'sheet' && m.id === 2)
    expect(exact).toBeDefined()
    expect(exact.similarity).toBe(1.0)
    expect(exact.isExactMatch).toBe(true)
    expect(exact.authorUsername).toBe('copier')
  })

  it('skips exact matches owned by the same user as reported content', async () => {
    const text = 'The mitochondria are the powerhouse of the cell and produce ATP for the body.'
    const fp = fingerprintLib.fingerprint(text)

    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      content: text,
      contentHash: fp.exactHash,
      contentSimhash: fp.simhash,
      createdAt: new Date('2026-01-01'),
    })

    mocks.prisma.studySheet.findMany
      .mockResolvedValueOnce([
        {
          id: 2,
          title: 'Own Sheet Copy',
          userId: 10, // same as reported
          createdAt: new Date('2026-02-01'),
          contentSimhash: fp.simhash,
          author: { id: 10, username: 'self' },
        },
      ])
      .mockResolvedValueOnce([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
    })

    expect(result.find((m) => m.id === 2 && m.type === 'sheet')).toBeUndefined()
  })

  it('detects simhash-similar matches above 0.70 threshold and ignores those below', async () => {
    const originalText =
      'Photosynthesis converts sunlight into chemical energy stored in glucose molecules. ' +
      'Plants use this process to grow and produce oxygen as a byproduct every single day. ' +
      'Chlorophyll in the leaves captures light energy from the sun during the morning.'
    const nearDuplicateText =
      'Photosynthesis converts sunlight into chemical energy stored in glucose molecules. ' +
      'Plants use this process to grow and produce oxygen as a byproduct every single day. ' +
      'Chlorophyll in the leaves captures light from the sun during the morning hours.'
    const differentText =
      'Quantum entanglement is a physical phenomenon that occurs when particles interact ' +
      'in ways such that the quantum state of each particle cannot be described independently. ' +
      'This forms a fundamental cornerstone of modern quantum mechanics and information theory.'

    const fpOriginal = fingerprintLib.fingerprint(originalText)
    const fpNear = fingerprintLib.fingerprint(nearDuplicateText)
    const fpDifferent = fingerprintLib.fingerprint(differentText)

    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      content: originalText,
      contentHash: fpOriginal.exactHash,
      contentSimhash: fpOriginal.simhash,
      createdAt: new Date('2026-01-01'),
    })

    // Lineage BFS (no descendants), then Phase 1 (no exact-hash matches), then Phase 2 simhash matches
    mocks.prisma.studySheet.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 2,
          title: 'Near Duplicate',
          userId: 20,
          createdAt: new Date('2026-02-01'),
          contentSimhash: fpNear.simhash,
          contentHash: fpNear.exactHash,
          author: { id: 20, username: 'near' },
        },
        {
          id: 3,
          title: 'Unrelated Topic',
          userId: 30,
          createdAt: new Date('2026-02-02'),
          contentSimhash: fpDifferent.simhash,
          contentHash: fpDifferent.exactHash,
          author: { id: 30, username: 'other' },
        },
      ])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
    })

    const near = result.find((m) => m.id === 2)
    const unrelated = result.find((m) => m.id === 3)
    expect(near).toBeDefined()
    expect(near.similarity).toBeGreaterThanOrEqual(0.7)
    expect(near.isExactMatch).toBe(false)
    expect(unrelated).toBeUndefined()
  })

  it('sorts results by similarity descending, then by createdAt ascending (older = likely original)', async () => {
    const text = 'The mitochondria are the powerhouse of the cell and produce ATP for the body.'
    const fp = fingerprintLib.fingerprint(text)

    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      content: text,
      contentHash: fp.exactHash,
      contentSimhash: fp.simhash,
      createdAt: new Date('2026-03-01'),
    })

    mocks.prisma.studySheet.findMany
      // Lineage BFS (no descendants)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 2,
          title: 'Newer Copy',
          userId: 20,
          createdAt: new Date('2026-02-15'),
          contentSimhash: fp.simhash,
          author: { id: 20, username: 'newer' },
        },
        {
          id: 3,
          title: 'Older Original',
          userId: 30,
          createdAt: new Date('2026-01-01'),
          contentSimhash: fp.simhash,
          author: { id: 30, username: 'older' },
        },
      ])
      .mockResolvedValueOnce([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
    })

    // Both are similarity 1.0 (exact hash), so the older one should sort first.
    expect(result[0].id).toBe(3)
    expect(result[0].authorUsername).toBe('older')
    expect(result[1].id).toBe(2)
  })

  it('respects the limit parameter', async () => {
    const text = 'The mitochondria are the powerhouse of the cell and produce ATP for the body.'
    const fp = fingerprintLib.fingerprint(text)

    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      content: text,
      contentHash: fp.exactHash,
      contentSimhash: fp.simhash,
      createdAt: new Date('2026-01-01'),
    })

    const fakeMatches = Array.from({ length: 15 }, (_, i) => ({
      id: i + 100,
      title: `Copy ${i}`,
      userId: 500 + i,
      createdAt: new Date(`2026-02-${String((i % 27) + 1).padStart(2, '0')}`),
      contentSimhash: fp.simhash,
      author: { id: 500 + i, username: `copier${i}` },
    }))

    mocks.prisma.studySheet.findMany
      // Lineage BFS (no descendants)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(fakeMatches)
      .mockResolvedValueOnce([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
      limit: 5,
    })

    expect(result.length).toBe(5)
  })

  it('returns [] and reports error to sentry when prisma throws', async () => {
    mocks.prisma.studySheet.findUnique.mockRejectedValue(new Error('db down'))

    const result = await plagiarismService.findSimilarContent({
      contentType: 'sheet',
      contentId: 1,
    })

    expect(result).toEqual([])
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})
