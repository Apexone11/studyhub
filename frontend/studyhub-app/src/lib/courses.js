/**
 * courses.js — shared client helpers for the /api/courses/schools response.
 *
 * The /api/courses/schools endpoint groups courses by school. Several pages
 * flatten that response into a single dropdown. A naive flatMap produced
 * visible duplicates whenever the same physical course id showed up under
 * more than one school entry (the user being multi-enrolled), and it gave
 * indistinguishable labels when two genuinely different course rows shared
 * the same code (e.g. CHEM101 at two different schools).
 *
 * `flattenSchoolsToCourses` centralizes the dedup + disambiguation rules.
 * Current call sites:
 *   - pages/notes/useNotesData.js
 *   - pages/sheets/upload/useUploadSheet.js
 *   - pages/sheets/lab/AiSheetSetupPage.jsx
 *   - pages/studyGroups/useGroupList.js
 *
 * Pages that intentionally keep the school-grouped catalog (two-level
 * school > course filter UIs) and so do NOT use this helper:
 *   - pages/sheets/useSheetsData.js (sheets list)
 *   - pages/courses/MyCoursesPage.jsx
 *   - pages/settings/CoursesTab.jsx
 *   - pages/onboarding/Step{School,Courses}.jsx
 *
 * If you add a new flat-dropdown call site, route it through this helper
 * so all dropdown surfaces stay consistent — fix it here once.
 */

/**
 * Flatten the /api/courses/schools response into a deduplicated list of
 * course rows suitable for a single dropdown. Returns:
 *   [{ id, code, name, schoolId, schoolName, schoolShort, ... }]
 *
 * - Keeps only the first occurrence of any given course id (the same
 *   course can appear under multiple school groupings).
 * - When two distinct course ids share the same code, the displayed
 *   `code` is suffixed with the school name (`"CHEM101 (Goucher)"`)
 *   so they are distinguishable in the dropdown.
 * - Each course is augmented with `schoolId`, `schoolName`, and
 *   `schoolShort` from its parent school so consumers can filter or
 *   render with school context.
 */
export function flattenSchoolsToCourses(schools) {
  if (!Array.isArray(schools)) return []

  const flat = schools.flatMap((school) =>
    (school?.courses || []).map((course) => ({
      ...course,
      schoolId: school?.id,
      schoolName: school?.name,
      schoolShort: school?.short,
    })),
  )

  const byId = new Map()
  for (const course of flat) {
    if (course?.id != null && !byId.has(course.id)) byId.set(course.id, course)
  }
  const deduped = Array.from(byId.values())

  const codeCounts = deduped.reduce((acc, c) => {
    if (!c?.code) return acc
    acc[c.code] = (acc[c.code] || 0) + 1
    return acc
  }, {})

  return deduped.map((c) =>
    c?.code && codeCounts[c.code] > 1 && c.schoolName
      ? { ...c, code: `${c.code} (${c.schoolName})` }
      : c,
  )
}

/**
 * Derive the set of school IDs the user belongs to from a `/api/auth/me`-
 * style enrollments array. Each enrollment row carries `course.school.id`
 * (see backend/src/modules/auth/auth.service.js — the include shape).
 *
 * Returns a string-coerced Array so consumers can pass directly into
 * `partitionCoursesBySchool`.
 */
export function enrolledSchoolIdsFromUser(user) {
  if (!user || !Array.isArray(user.enrollments)) return []
  const ids = new Set()
  for (const enrollment of user.enrollments) {
    const id = enrollment?.course?.school?.id ?? enrollment?.course?.schoolId
    if (id != null) ids.add(String(id))
  }
  return Array.from(ids)
}

/**
 * Partition a flat course list into "primary" (user's school) vs "other"
 * buckets so dropdowns can render two `<optgroup>` sections — defaults to
 * the user's enrolled school but offers a clearly-labeled escape hatch
 * when the course they want lives at a different school.
 *
 * Both arrays are sorted by `code` (case-insensitive, locale-aware) so
 * the dropdown order is stable across renders.
 *
 * `enrolledSchoolIds` may be empty (self-learner with no enrollments yet
 * or unauthenticated browsing) — in that case everything goes to `other`
 * and the consumer should render only the "Other schools" optgroup.
 */
export function partitionCoursesBySchool(courses, enrolledSchoolIds) {
  const enrolledSet = new Set((enrolledSchoolIds || []).map((id) => String(id)))
  const primary = []
  const other = []
  for (const c of courses || []) {
    if (!c) continue
    if (c.schoolId != null && enrolledSet.has(String(c.schoolId))) {
      primary.push(c)
    } else {
      other.push(c)
    }
  }
  const byCode = (a, b) =>
    String(a.code || '').localeCompare(String(b.code || ''), undefined, { sensitivity: 'base' })
  primary.sort(byCode)
  other.sort(byCode)
  return { primary, other }
}
