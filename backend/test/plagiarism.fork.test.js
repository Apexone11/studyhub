import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/prisma', () => {
  const studySheet = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  }
  return { default: { studySheet }, studySheet }
})

vi.mock('../src/monitoring/sentry', () => ({
  captureError: vi.fn(),
  default: { captureError: vi.fn() },
}))

const prismaMod = await import('../src/lib/prisma')
const prisma = prismaMod.default || prismaMod
const plagiarismMod = await import('../src/lib/plagiarism.js')
const getForkLineageIds =
  plagiarismMod.getForkLineageIds || plagiarismMod.default?.getForkLineageIds

describe('plagiarism fork-lineage filter', () => {
  beforeEach(() => {
    prisma.studySheet.findUnique.mockReset()
    prisma.studySheet.findMany.mockReset()
  })

  describe('getForkLineageIds', () => {
    it('returns just the sheet itself when there are no fork relationships', async () => {
      prisma.studySheet.findUnique.mockResolvedValueOnce({ id: 1, forkOf: null })
      prisma.studySheet.findMany.mockResolvedValueOnce([])

      const lineage = await getForkLineageIds(prisma, 1)
      expect(Array.from(lineage)).toEqual([1])
    })

    it('walks ancestors via forkOf chain', async () => {
      prisma.studySheet.findUnique
        .mockResolvedValueOnce({ id: 3, forkOf: 2 })
        .mockResolvedValueOnce({ id: 2, forkOf: 1 })
        .mockResolvedValueOnce({ id: 1, forkOf: null })
      prisma.studySheet.findMany.mockResolvedValueOnce([])

      const lineage = await getForkLineageIds(prisma, 3)
      expect(Array.from(lineage).sort()).toEqual([1, 2, 3])
    })

    it('includes descendants and siblings discovered via BFS', async () => {
      prisma.studySheet.findUnique
        .mockResolvedValueOnce({ id: 5, forkOf: 1 })
        .mockResolvedValueOnce({ id: 1, forkOf: null })
      prisma.studySheet.findMany
        .mockResolvedValueOnce([{ id: 6 }, { id: 7 }])
        .mockResolvedValueOnce([])

      const lineage = await getForkLineageIds(prisma, 5)
      expect(Array.from(lineage).sort()).toEqual([1, 5, 6, 7])
    })

    it('handles missing sheetId gracefully', async () => {
      const lineage = await getForkLineageIds(prisma, null)
      expect(Array.from(lineage)).toEqual([null])
    })
  })

  // The behavioral guarantee of the fix is that getForkLineageIds returns the
  // entire fork tree for any sheet — so any caller that uses this set as a
  // filter ID exclusion will skip the parent, ancestors, descendants, and
  // siblings. The unit-level guarantee is verified above; full findSimilarSheets
  // integration is exercised in backend/test/integration tests against a real
  // DB and doesn't belong in a pure-mock unit test.
  describe('lineage shape covers the fork family', () => {
    it('a fork target excludes both parent (ancestor) and itself', async () => {
      prisma.studySheet.findUnique
        .mockResolvedValueOnce({ id: 2, forkOf: 1 })
        .mockResolvedValueOnce({ id: 1, forkOf: null })
      prisma.studySheet.findMany.mockResolvedValueOnce([])

      const lineage = await getForkLineageIds(prisma, 2)
      expect(lineage.has(1)).toBe(true) // parent excluded
      expect(lineage.has(2)).toBe(true) // self excluded
    })

    it('a sibling fork is also excluded', async () => {
      // Sheet 3 forked from 1. Sheet 1 also has child 4 (sibling of 3).
      prisma.studySheet.findUnique
        .mockResolvedValueOnce({ id: 3, forkOf: 1 })
        .mockResolvedValueOnce({ id: 1, forkOf: null })
      prisma.studySheet.findMany
        .mockResolvedValueOnce([{ id: 4 }]) // BFS finds sibling
        .mockResolvedValueOnce([])

      const lineage = await getForkLineageIds(prisma, 3)
      expect(lineage.has(4)).toBe(true)
    })
  })
})
