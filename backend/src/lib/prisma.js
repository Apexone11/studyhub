const { PrismaClient } = require('@prisma/client')

const globalForPrisma = globalThis

const prisma = globalForPrisma.__studyhubPrisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__studyhubPrisma = prisma
}

module.exports = prisma
