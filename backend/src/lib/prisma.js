const { PrismaClient } = require('@prisma/client')

const globalForPrisma = globalThis

function createPrismaClient() {
  return new PrismaClient()
}

const prisma = globalForPrisma.__studyhubPrisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__studyhubPrisma = prisma
}

module.exports = prisma
module.exports.createPrismaClient = createPrismaClient
