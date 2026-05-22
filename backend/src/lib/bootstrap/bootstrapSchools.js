const { SCHOOLS } = require('../catalog/catalogData')

// Fields that get populated from the catalog on insert AND backfilled on
// update if currently null. Lets us extend the catalog over time without
// blowing away admin-tweaked values. Wave-12.2 (2026-05-16) — added the
// detail columns (description, lat/lng, etc.) for the location-sort +
// course-detail-drawer features on /my-courses.
const CATALOG_FIELDS = [
  'name',
  'short',
  'city',
  'state',
  'schoolType',
  'description',
  'websiteUrl',
  'latitude',
  'longitude',
  'enrollmentSize',
  'foundedYear',
  'mascot',
]

function pickCatalogData(school) {
  const data = {}
  for (const field of CATALOG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(school, field) && school[field] !== undefined) {
      data[field] = school[field]
    }
  }
  return data
}

function pickFieldsToBackfill(school, existingRow) {
  // Backfill any catalog-provided value that's currently null on the row.
  // Preserves any value an admin manually edited (e.g., a custom logoUrl).
  const data = {}
  for (const field of CATALOG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(school, field)) continue
    if (school[field] === undefined || school[field] === null) continue
    if (existingRow[field] == null) {
      data[field] = school[field]
    }
  }
  // Always sync name + short in case the catalog corrected a typo.
  if (existingRow.name !== school.name) data.name = school.name
  if (existingRow.short !== school.short) data.short = school.short
  return data
}

/**
 * Ensures all seed schools exist and are up-to-date.
 * Returns a Map of uppercase-short -> school record (with courses).
 */
async function ensureSchools(prisma) {
  const existingSchools = await prisma.school.findMany({
    select: {
      id: true,
      name: true,
      short: true,
      city: true,
      state: true,
      schoolType: true,
      description: true,
      websiteUrl: true,
      latitude: true,
      longitude: true,
      enrollmentSize: true,
      foundedYear: true,
      mascot: true,
      courses: {
        select: { code: true },
      },
    },
  })

  const schoolsByShort = new Map(
    existingSchools.map((school) => [school.short.toUpperCase(), school]),
  )

  let schoolsCreated = 0
  let schoolsUpdated = 0

  for (const school of SCHOOLS) {
    const short = school.short.toUpperCase()
    let currentSchool = schoolsByShort.get(short)

    if (!currentSchool) {
      currentSchool = await prisma.school.create({
        data: pickCatalogData(school),
      })
      currentSchool.courses = []
      schoolsByShort.set(short, currentSchool)
      schoolsCreated += 1
    } else {
      const updates = pickFieldsToBackfill(school, currentSchool)
      if (Object.keys(updates).length > 0) {
        currentSchool = await prisma.school.update({
          where: { id: currentSchool.id },
          data: updates,
          select: {
            id: true,
            name: true,
            short: true,
            city: true,
            state: true,
            schoolType: true,
            description: true,
            websiteUrl: true,
            latitude: true,
            longitude: true,
            enrollmentSize: true,
            foundedYear: true,
            mascot: true,
            courses: { select: { code: true } },
          },
        })
        schoolsByShort.set(short, currentSchool)
        schoolsUpdated += 1
      }
    }
  }

  return { schoolsByShort, schoolsCreated, schoolsUpdated }
}

module.exports = { ensureSchools }
