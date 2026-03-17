const { createPrismaClient } = require('./prisma')
const { archiveExpiredOriginalVersions } = require('./htmlArchive')

let archiveInterval = null

function startHtmlArchiveScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (archiveInterval) return

  const intervalMs = Number.parseInt(process.env.HTML_ARCHIVE_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10)
  const prisma = createPrismaClient()

  const runArchive = async () => {
    try {
      await archiveExpiredOriginalVersions(prisma, {
        olderThanDays: Number.parseInt(process.env.HTML_ARCHIVE_DAYS || '20', 10),
        limit: Number.parseInt(process.env.HTML_ARCHIVE_BATCH_SIZE || '50', 10),
      })
    } catch {
      // Archive is best-effort and should not crash API runtime.
    }
  }

  void runArchive()
  archiveInterval = setInterval(runArchive, Math.max(60000, intervalMs))
  if (typeof archiveInterval.unref === 'function') archiveInterval.unref()
}

module.exports = {
  startHtmlArchiveScheduler,
}