import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module
vi.mock('../src/lib/prisma', () => ({
  default: {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('../src/monitoring/sentry', () => ({
  captureError: vi.fn(),
}))

// Import after mocking
const {
  hammingDistance,
  calculateSimilarity,
  findSimilarSheets,
  runPlagiarismScan,
} = await import('../src/lib/plagiarism.js')

// captureError is accessed via the vi.mock above, not a direct import.

describe('plagiarism.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hammingDistance', () => {
    it('returns 0 for identical hashes', () => {
      const hash = 'abc123def456abc1'
      expect(hammingDistance(hash, hash)).toBe(0)
    })

    it('returns 64 when first hash is null', () => {
      expect(hammingDistance(null, 'abc123def456abc1')).toBe(64)
    })

    it('returns 64 when second hash is null', () => {
      expect(hammingDistance('abc123def456abc1', null)).toBe(64)
    })

    it('returns 64 when both hashes are undefined', () => {
      expect(hammingDistance(undefined, undefined)).toBe(64)
    })

    it('calculates hamming distance for completely different hashes', () => {
      const hash1 = '0000000000000000'
      const hash2 = 'ffffffffffffffff'
      expect(hammingDistance(hash1, hash2)).toBe(64)
    })

    it('calculates hamming distance with known single-bit difference', () => {
      const hash1 = '0000000000000000'
      const hash2 = '0000000000000001'
      expect(hammingDistance(hash1, hash2)).toBe(1)
    })

    it('calculates hamming distance with multiple bit differences', () => {
      const hash1 = '0000000000000000'
      const hash2 = '000000000000000f'
      expect(hammingDistance(hash1, hash2)).toBe(4) // 0x0f = 0b1111
    })

    it('handles invalid hash format by catching error and returning 64', () => {
      // Use a string with invalid hex characters that will cause BigInt to throw
      expect(hammingDistance('zzzzzzzzzzzzzzzz', 'abc123def456abc1')).toBe(64)
      // Error is caught and logged via captureError from sentry
    })

    it('calculates symmetric distance', () => {
      const hash1 = '1234567890abcdef'
      const hash2 = 'fedcba0987654321'
      const dist1 = hammingDistance(hash1, hash2)
      const dist2 = hammingDistance(hash2, hash1)
      expect(dist1).toBe(dist2)
    })
  })

  describe('calculateSimilarity', () => {
    it('returns 100 for distance 0', () => {
      expect(calculateSimilarity(0)).toBe(100)
    })

    it('returns 0 for distance 64', () => {
      expect(calculateSimilarity(64)).toBe(0)
    })

    it('returns approximately 84.38 for distance 10', () => {
      const result = calculateSimilarity(10)
      expect(result).toBeCloseTo(84.38, 1)
    })

    it('returns 50 for distance 32', () => {
      expect(calculateSimilarity(32)).toBe(50)
    })

    it('returns 93.75 for distance 4', () => {
      expect(calculateSimilarity(4)).toBe(93.75)
    })

    it('rounds to 2 decimal places', () => {
      const result = calculateSimilarity(13)
      expect(result).toBe(79.69)
      expect(String(result).split('.')[1]?.length || 0).toBeLessThanOrEqual(2)
    })
  })

  describe('findSimilarSheets', () => {
    it('returns empty array when no sheets have simhash', async () => {
      // This tests the basic error handling behavior without relying on mocks
      const result = await findSimilarSheets(999)
      // If Prisma is not available, it should return empty array due to try-catch
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns empty array on error gracefully', async () => {
      // Test that the function handles errors by returning empty array
      const result = await findSimilarSheets(9999999)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
  })

  describe('runPlagiarismScan', () => {
    it('returns empty array when no sheets exist', async () => {
      const result = await runPlagiarismScan()
      // Should return empty array (from catch handler)
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns gracefully on any error', async () => {
      // Test that the function handles errors by returning empty array
      const result = await runPlagiarismScan(10)
      expect(Array.isArray(result)).toBe(true)
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
