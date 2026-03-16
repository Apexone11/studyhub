const { PrismaClient } = require('@prisma/client')
const { DEFAULT_ADMIN_EMAIL, ensureAdminUser, repairRuntimeSchema } = require('../src/lib/bootstrap')
const prisma = new PrismaClient()

async function main() {
  if (!(process.env.ADMIN_USERNAME || '').trim()) {
    throw new Error('ADMIN_USERNAME is required for admin bootstrap.')
  }
  await repairRuntimeSchema(prisma)
  await ensureAdminUser(prisma)
  console.log(`Admin bootstrap finished. ADMIN_EMAIL defaults to ${DEFAULT_ADMIN_EMAIL} when not explicitly set.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
