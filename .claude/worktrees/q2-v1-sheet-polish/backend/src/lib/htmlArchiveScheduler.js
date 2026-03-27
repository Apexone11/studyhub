const prisma = require('./prisma')
const { archiveExpiredOriginalVersions } = require('./htmlArchive')

let archiveInterval = null

function startHtmlArchiveScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (archiveInterval) return

  const parsedIntervalMs = Number.parseInt(process.env.HTML_ARCHIVE_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10)
  const intervalMs = Number.isFinite(parsedIntervalMs) ? parsedIntervalMs : (6 * 60 * 60 * 1000)

  const runArchive = async () => {
    try {
      await archiveExpiredOriginalVersions(prisma, {
        olderThanDays: Number.parseInt(process.env.HTML_ARCHIVE_DAYS || '20', 10),
        limit: Number.parseInt(process.env.HTML_ARCHIVE_BATCH_SIZE || '50', 10),
      })
    } catch (error) {
      // Archive is best-effort and should not crash API runtime.
      console.error('HTML archive scheduler run failed:', error)
    }
  }

  void runArchive()
  archiveInterval = setInterval(runArchive, Math.max(60000, intervalMs))
  if (typeof archiveInterval.unref === 'function') archiveInterval.unref()
}

module.exports = {
  startHtmlArchiveScheduler,
}