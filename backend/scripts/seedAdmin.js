const { DEFAULT_ADMIN_EMAIL, ensureAdminUser, repairRuntimeSchema } = require('../src/lib/bootstrap')
const { createPrismaClient } = require('../src/lib/prisma')
const prisma = createPrismaClient({ preferDirectUrl: true })

async function main() {
  if (!(process.env.ADMIN_USERNAME || '').trim()) {
    throw new Error('ADMIN_USERNAME is required for admin bootstrap.')
  }
  if (!(process.env.ADMIN_PASSWORD || '').trim()) {
    throw new Error('ADMIN_PASSWORD is required to create or sync the admin bootstrap account.')
  }
  await repairRuntimeSchema(prisma)
  await ensureAdminUser(prisma)
  console.log(`Admin bootstrap finished. ADMIN_EMAIL defaults to ${DEFAULT_ADMIN_EMAIL} when not explicitly set.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
