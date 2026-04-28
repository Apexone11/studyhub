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
