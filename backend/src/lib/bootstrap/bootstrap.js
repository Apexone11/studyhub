const { captureError } = require('../../monitoring/sentry')
const { createPrismaClient } = require('../prisma')
const { repairRuntimeSchema } = require('./bootstrapSchema')
const { ensureSchools } = require('./bootstrapSchools')
const { ensureCourses } = require('./bootstrapCourses')
const { DEFAULT_ADMIN_EMAIL, ensureAdminUser } = require('./bootstrapAdmin')
const { seedBadgeCatalog } = require('../badges')

/**
 * Combined catalog seeder — delegates to ensureSchools + ensureCourses
 * and preserves the original ensureCatalogData interface for callers.
 */
async function ensureCatalogData(prisma) {
  const { schoolsByShort, schoolsCreated, schoolsUpdated } = await ensureSchools(prisma)
  const { coursesCreated } = await ensureCourses(prisma, schoolsByShort)

  if (schoolsCreated || schoolsUpdated || coursesCreated) {
    console.log(
      `Catalog bootstrap complete: ${schoolsCreated} schools created, ${schoolsUpdated} schools updated, ${coursesCreated} courses created.`
    )
  }
}

async function bootstrapRuntime() {
  const prisma = createPrismaClient()

  try {
    await repairRuntimeSchema(prisma)
    await ensureCatalogData(prisma)
    await ensureAdminUser(prisma)
    await seedBadgeCatalog(prisma)
  } catch (error) {
    captureError(error, { source: 'bootstrapRuntime' })
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  bootstrapRuntime,
  ensureAdminUser,
  ensureCatalogData,
  repairRuntimeSchema,
}
