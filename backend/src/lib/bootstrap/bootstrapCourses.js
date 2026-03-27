const { SCHOOLS, COURSES } = require('./catalog/catalogData')

/**
 * Ensures all seed courses exist for every school in the catalog.
 * Accepts the schoolsByShort map produced by ensureSchools().
 */
async function ensureCourses(prisma, schoolsByShort) {
  let coursesCreated = 0

  for (const school of SCHOOLS) {
    const short = school.short.toUpperCase()
    const currentSchool = schoolsByShort.get(short)
    if (!currentSchool) continue

    const targetCourses = COURSES[short] || COURSES.DEFAULT || []
    const existingCodes = new Set(
      (currentSchool.courses || []).map((course) => String(course.code).toUpperCase())
    )
    const missingCourses = targetCourses.filter(
      (course) => !existingCodes.has(String(course.code).toUpperCase())
    )

    if (missingCourses.length > 0) {
      await prisma.course.createMany({
        data: missingCourses.map((course) => ({
          schoolId: currentSchool.id,
          code: course.code,
          name: course.name,
        })),
      })
      coursesCreated += missingCourses.length
    }
  }

  return { coursesCreated }
}

module.exports = { ensureCourses }
