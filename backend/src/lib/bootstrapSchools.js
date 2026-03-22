const { SCHOOLS } = require('./catalogData')

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
      courses: {
        select: { code: true },
      },
    },
  })

  const schoolsByShort = new Map(
    existingSchools.map((school) => [school.short.toUpperCase(), school])
  )

  let schoolsCreated = 0
  let schoolsUpdated = 0

  for (const school of SCHOOLS) {
    const short = school.short.toUpperCase()
    let currentSchool = schoolsByShort.get(short)

    if (!currentSchool) {
      currentSchool = await prisma.school.create({
        data: {
          name: school.name,
          short: school.short,
        },
      })
      currentSchool.courses = []
      schoolsByShort.set(short, currentSchool)
      schoolsCreated += 1
    } else if (currentSchool.name !== school.name) {
      currentSchool = await prisma.school.update({
        where: { id: currentSchool.id },
        data: { name: school.name, short: school.short },
        select: {
          id: true,
          name: true,
          short: true,
          courses: { select: { code: true } },
        },
      })
      schoolsByShort.set(short, currentSchool)
      schoolsUpdated += 1
    }
  }

  return { schoolsByShort, schoolsCreated, schoolsUpdated }
}

module.exports = { ensureSchools }
