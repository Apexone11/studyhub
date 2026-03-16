const { PrismaClient } = require('@prisma/client')
const { withAccelerate } = require('@prisma/extension-accelerate')
const { withOptimize } = require('@prisma/extension-optimize')

const globalForPrisma = globalThis
const ACCELERATE_URL_PATTERN = /^prisma(\+postgres)?:\/\//i

function databaseUrl() {
  return (process.env.DATABASE_URL || '').trim()
}

function directDatabaseUrl() {
  return (process.env.DIRECT_DATABASE_URL || '').trim()
}

function isAccelerateUrl(url) {
  return ACCELERATE_URL_PATTERN.test(url)
}

function isAccelerateEnabled() {
  return isAccelerateUrl(databaseUrl())
}

function optimizeApiKey() {
  return (process.env.OPTIMIZE_API_KEY || '').trim()
}

function optimizeEnabledFlag() {
  return /^(1|true|yes|on)$/i.test((process.env.OPTIMIZE_ENABLE || '').trim())
}

function shouldUseOptimize() {
  return process.env.NODE_ENV !== 'production' && optimizeEnabledFlag() && Boolean(optimizeApiKey())
}

function validatePrismaEnvironment() {
  if (!isAccelerateEnabled()) return

  if (directDatabaseUrl()) return

  const message = 'Prisma Accelerate requires DIRECT_DATABASE_URL for Prisma CLI and migrations.'
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message)
  }

  console.warn(`${message} Local runtime can continue, but migrate/introspection commands will fail until it is set.`)
}

function createPrismaClient(options = {}) {
  const { preferDirectUrl = false } = options
  const useDirectUrl = preferDirectUrl && Boolean(directDatabaseUrl())
  let client = useDirectUrl
    ? new PrismaClient({ datasourceUrl: directDatabaseUrl() })
    : new PrismaClient()

  if (shouldUseOptimize()) {
    // Prisma Optimize is meant for local development query analysis, not production traffic.
    client = client.$extends(withOptimize({ apiKey: optimizeApiKey() }))
  }

  if (useDirectUrl || !isAccelerateEnabled()) {
    return client
  }

  return client.$extends(withAccelerate())
}

const prisma = globalForPrisma.__studyhubPrisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__studyhubPrisma = prisma
}

module.exports = prisma
module.exports.createPrismaClient = createPrismaClient
module.exports.isAccelerateEnabled = isAccelerateEnabled
module.exports.validatePrismaEnvironment = validatePrismaEnvironment
