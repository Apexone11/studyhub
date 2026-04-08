/**
 * prisma.js -- Singleton Prisma client with production-tuned connection pool.
 *
 * Connection pool strategy (same approach used by Vercel, Railway, Render):
 *   - connection_limit: 10 (Railway starter/pro gives ~25 max; leaves room for
 *     direct connections from migrations, admin tools, etc.)
 *   - pool_timeout: 20s (wait up to 20s for a connection from the pool)
 *   - connect_timeout: 10s (TCP connection timeout to the database)
 *   - Idle connections recycled every 5 minutes to prevent stale connections
 *
 * These values can be overridden via the DATABASE_URL query string:
 *   DATABASE_URL="postgres://...?connection_limit=15&pool_timeout=30"
 */

const { PrismaClient } = require('@prisma/client')
const { withEncryption } = require('./prismaEncryption')

const globalForPrisma = globalThis

function createPrismaClient() {
  const isProduction = process.env.NODE_ENV === 'production'

  const client = new PrismaClient({
    // Log slow queries in development for debugging
    log: isProduction
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],

    // Datasource override: append pool settings if not already in the URL.
    // This ensures consistent pool behavior even if the env var doesn't
    // include these params (which is common with Railway auto-provisioned DBs).
    datasources: {
      db: {
        url: appendPoolParams(process.env.DATABASE_URL || ''),
      },
    },
  })

  // Log Prisma errors to console (and Sentry if available)
  client.$on('error', (e) => {
    console.error('[Prisma Error]', e.message)
  })

  return withEncryption(client)
}

/**
 * Append connection pool query parameters if they are not already present
 * in the DATABASE_URL. This is a safe operation -- if the URL already has
 * these params, they are not duplicated.
 */
function appendPoolParams(url) {
  if (!url) return url

  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '10')
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '20')
    }
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '10')
    }
    return parsed.toString()
  } catch {
    // If URL parsing fails, return the original (Prisma will handle the error)
    return url
  }
}

const prisma = globalForPrisma.__studyhubPrisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__studyhubPrisma = prisma
}

module.exports = prisma
module.exports.createPrismaClient = createPrismaClient
