/**
 * aiAttachments.retention.test.js — two-phase sweeper tests.
 * Master plan §4.3 + L5-CRIT-4.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const targetPath = require.resolve('../src/lib/jobs/aiAttachmentSweeper.js')

const mocks = vi.hoisted(() => ({
  prisma: {
    aiAttachment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  },
  attachmentsService: {
    decrementStorageQuota: vi.fn(),
    deleteFromBucket: vi.fn(),
  },
  sentry: { captureError: vi.fn() },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/modules/ai/attachments/attachments.service'), mocks.attachmentsService],
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
  delete require.cache[targetPath]
  mod = require(targetPath)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[targetPath]
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('markExpiredAttachments', () => {
  it('updates expired rows and decrements per-user storage quota', async () => {
    mocks.prisma.aiAttachment.findMany
      .mockResolvedValueOnce([
        { id: 1, userId: 7, bytes: 1000 },
        { id: 2, userId: 7, bytes: 2000 },
        { id: 3, userId: 9, bytes: 500 },
      ])
      .mockResolvedValueOnce([])
    mocks.prisma.aiAttachment.updateMany.mockResolvedValue({ count: 3 })
    const total = await mod.markExpiredAttachments()
    expect(total).toBe(3)
    expect(mocks.prisma.aiAttachment.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.attachmentsService.decrementStorageQuota).toHaveBeenCalledTimes(2)
    expect(mocks.attachmentsService.decrementStorageQuota).toHaveBeenCalledWith({
      userId: 7,
      bytes: 3000,
    })
    expect(mocks.attachmentsService.decrementStorageQuota).toHaveBeenCalledWith({
      userId: 9,
      bytes: 500,
    })
  })

  it('returns 0 when nothing is expired', async () => {
    mocks.prisma.aiAttachment.findMany.mockResolvedValueOnce([])
    expect(await mod.markExpiredAttachments()).toBe(0)
  })
})

describe('drainSoftDeletedToR2', () => {
  it('deletes from R2 then hard-deletes the row', async () => {
    mocks.prisma.aiAttachment.findMany.mockResolvedValueOnce([
      { id: 11, r2Key: 'k11' },
      { id: 12, r2Key: 'k12' },
    ])
    mocks.attachmentsService.deleteFromBucket.mockResolvedValue()
    mocks.prisma.aiAttachment.delete.mockResolvedValue({})
    const result = await mod.drainSoftDeletedToR2()
    expect(result).toEqual({ ok: 2, failed: 0 })
    expect(mocks.attachmentsService.deleteFromBucket).toHaveBeenCalledTimes(2)
    expect(mocks.prisma.aiAttachment.delete).toHaveBeenCalledTimes(2)
  }, 10000)

  it('counts R2 failures separately and does not hard-delete the row', async () => {
    mocks.prisma.aiAttachment.findMany.mockResolvedValueOnce([{ id: 21, r2Key: 'k21' }])
    mocks.attachmentsService.deleteFromBucket.mockRejectedValue(new Error('R2 down'))
    const result = await mod.drainSoftDeletedToR2()
    expect(result.ok).toBe(0)
    expect(result.failed).toBe(1)
    expect(mocks.prisma.aiAttachment.delete).not.toHaveBeenCalled()
  }, 10000)
})
