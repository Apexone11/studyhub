import { describe, expect, it, vi } from 'vitest'
import { archiveExpiredOriginalVersions } from '../src/lib/htmlArchive'

describe('htmlArchive', () => {
  it('archives expired original versions and marks sheet metadata', async () => {
    const updateVersion = vi.fn(async () => null)
    const updateSheet = vi.fn(async () => null)

    const prisma = {
      sheetHtmlVersion: {
        findMany: vi.fn(async () => ([
          { id: 1, sheetId: 99, content: '<main>old</main>' },
        ])),
        update: updateVersion,
      },
      studySheet: {
        update: updateSheet,
      },
      $transaction: vi.fn(async (ops) => Promise.all(ops)),
    }

    const summary = await archiveExpiredOriginalVersions(prisma, { olderThanDays: 20, limit: 10 })

    expect(summary.archived).toBe(1)
    expect(prisma.sheetHtmlVersion.findMany).toHaveBeenCalledTimes(1)
    expect(updateVersion).toHaveBeenCalledTimes(1)
    expect(updateSheet).toHaveBeenCalledTimes(1)
  })
})