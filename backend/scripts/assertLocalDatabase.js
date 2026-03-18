const { URL } = require('node:url')

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'db',
  'postgres',
  'postgresql',
])

function resolveDatabaseHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection string.')
  }
}

function isAllowedLocalHost(host) {
  if (LOCAL_HOSTS.has(host)) return true
  if (host.endsWith('.local')) return true
  return false
}

function assertLocalDatabase(actionName = 'database seed') {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim()
  if (!databaseUrl) {
    throw new Error(`[safety] ${actionName} requires DATABASE_URL.`)
  }

  const host = resolveDatabaseHost(databaseUrl)
  if (!isAllowedLocalHost(host)) {
    throw new Error(
      `[safety] Refusing to run ${actionName} against non-local DATABASE_URL host "${host}". ` +
      'Allowed hosts: localhost, 127.0.0.1, ::1, db, postgres.'
    )
  }
}

module.exports = {
  assertLocalDatabase,
}
