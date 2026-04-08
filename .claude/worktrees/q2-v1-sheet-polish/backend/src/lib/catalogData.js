// Barrel re-export — split into smaller modules for maintainability.
// All consumers can still require('./catalogData') and get { SCHOOLS, COURSES }.

const { SCHOOLS } = require('./catalogSchools')
const { COURSES_MAJOR } = require('./catalogCourses_major')
const { COURSES_PUBLIC } = require('./catalogCourses_public')
const { COURSES_PRIVATE } = require('./catalogCourses_private')
const { COURSES_COMMUNITY } = require('./catalogCourses_community')

const COURSES = {
  ...COURSES_MAJOR,
  ...COURSES_PUBLIC,
  ...COURSES_PRIVATE,
  ...COURSES_COMMUNITY,
}

module.exports = {
  SCHOOLS,
  COURSES,
}
