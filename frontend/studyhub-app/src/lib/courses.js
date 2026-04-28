/**
 * courses.js — shared client helpers for the /api/courses/schools response.
 *
 * The /api/courses/schools endpoint groups courses by school. Five different
 * pages (notes, sheets upload, sheets list, study groups, AI sheet setup)
 * all flatten that response into a single dropdown. The naive flatMap
 * produced visible duplicates whenever the same physical course id showed
 * up under more than one school entry (the user being multi-enrolled), and
 * it gave indistinguishable labels when two genuinely-different course rows
 * shared the same code (e.g. CHEM101 at two different schools).
 *
 * `flattenSchoolsToCourses` consolidates the dedup + disambiguation rules
 * so all five pages stay consistent — fix it here once, never have to chase
 * the same bug across five pages again.
 */

/**
 * Flatten the /api/courses/schools response into a deduplicated list of
 * course rows suitable for a single dropdown. Returns:
 *   [{ id, code, name, schoolName, ... }]
 *
 * - Keeps only the first occurrence of any given course id (the same
 *   course can appear under multiple school groupings).
 * - When two distinct course ids share the same code, the displayed
 *   `code` is suffixed with the school name (`"CHEM101 (Goucher)"`)
 *   so they are distinguishable in the dropdown.
 */
export function flattenSchoolsToCourses(schools) {
  if (!Array.isArray(schools)) return []

  const flat = schools.flatMap((school) =>
    (school?.courses || []).map((course) => ({ ...course, schoolName: school?.name })),
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
