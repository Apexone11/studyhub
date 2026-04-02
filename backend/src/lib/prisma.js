const { PrismaClient } = require('@prisma/client')
const { withEncryption } = require('./prismaEncryption')

const globalForPrisma = globalThis

function createPrismaClient() {
  const client = new PrismaClient()
  return withEncryption(client)
}

const prisma = globalForPrisma.__studyhubPrisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__studyhubPrisma = prisma
}

module.exports = prisma
module.exports.createPrismaClient = createPrismaClient
