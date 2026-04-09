/**
 * queryLogger.js -- Prisma slow query logger (dev/staging only)
 *
 * Hooks into Prisma's $on('query') event and logs any query that takes
 * longer than SLOW_QUERY_THRESHOLD_MS. In production, this is a no-op
 * unless ENABLE_QUERY_LOGGING=true is explicitly set.
 *
 * Phase 6 Step 2: "Add EXPLAIN ANALYZE logging in dev."
 */

const SLOW_QUERY_THRESHOLD_MS = 200

/**
 * Attach slow-query logging to a Prisma client instance.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
function attachQueryLogger(prisma) {
  const isDev = process.env.NODE_ENV !== 'production'
  const forceEnabled = process.env.ENABLE_QUERY_LOGGING === 'true'

  if (!isDev && !forceEnabled) return

  if (typeof prisma.$on !== 'function') return

  prisma.$on('query', (event) => {
    const durationMs = Number(event.duration)
    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        `[SLOW QUERY] ${durationMs}ms | ${event.query} | params: ${event.params}`
      )
    }
  })
}

module.exports = { attachQueryLogger, SLOW_QUERY_THRESHOLD_MS }
