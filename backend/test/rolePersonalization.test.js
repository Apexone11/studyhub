import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBoostedIdsForUser } from '../src/lib/rolePersonalization.js'

function makePrisma() {
  return {
    enrollment: { findMany: vi.fn() },
    hashtagFollow: { findMany: vi.fn() },
  }
}

let prisma

beforeEach(() => {
  prisma = makePrisma()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('getBoostedIdsForUser', () => {
  it('returns enrolled course IDs for students', async () => {
    prisma.enrollment.findMany.mockResolvedValue([{ courseId: 10 }, { courseId: 11 }])
    const result = await getBoostedIdsForUser({ id: 1, accountType: 'student' }, { prisma })
    expect(result).toEqual({ kind: 'course', ids: [10, 11] })
    expect(prisma.hashtagFollow.findMany).not.toHaveBeenCalled()
  })

  it('returns enrolled course IDs for teachers (also course-shaped)', async () => {
    prisma.enrollment.findMany.mockResolvedValue([{ courseId: 7 }])
    const result = await getBoostedIdsForUser({ id: 2, accountType: 'teacher' }, { prisma })
    expect(result).toEqual({ kind: 'course', ids: [7] })
  })

  it('returns followed hashtag IDs for Self-learners', async () => {
    prisma.hashtagFollow.findMany.mockResolvedValue([
      { hashtagId: 100 },
      { hashtagId: 101 },
      { hashtagId: 102 },
    ])
    const result = await getBoostedIdsForUser({ id: 3, accountType: 'other' }, { prisma })
    expect(result).toEqual({ kind: 'hashtag', ids: [100, 101, 102] })
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled()
  })

  it('treats unknown accountType as course (safe default)', async () => {
    prisma.enrollment.findMany.mockResolvedValue([])
    const result = await getBoostedIdsForUser({ id: 4, accountType: undefined }, { prisma })
    expect(result.kind).toBe('course')
  })

  it('returns empty ids without throwing when the prisma query fails', async () => {
    prisma.hashtagFollow.findMany.mockRejectedValue(new Error('table missing'))
    const result = await getBoostedIdsForUser({ id: 5, accountType: 'other' }, { prisma })
    expect(result).toEqual({ kind: 'hashtag', ids: [] })
  })

  it('returns empty list for a missing user', async () => {
    const result = await getBoostedIdsForUser(null, { prisma })
    expect(result).toEqual({ kind: 'course', ids: [] })
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled()
    expect(prisma.hashtagFollow.findMany).not.toHaveBeenCalled()
  })
})
