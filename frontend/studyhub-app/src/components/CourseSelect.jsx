/**
 * CourseSelect — shared dropdown that scopes courses to the user's school
 * with an explicit "Other schools" group as an escape hatch.
 *
 * Used by every flat-list course dropdown surface (notes editor, sheets
 * upload, AI sheet setup, study-groups create). Renders native <select>
 * + <optgroup> so the dropdown is theme-agnostic (browser draws it) and
 * works correctly in both light and dark mode without custom CSS.
 *
 * Behavior:
 *   - Always renders a "No course" option as the first entry.
 *   - When the user has enrollments, courses at their school(s) appear
 *     first under the "Your school" optgroup. The "Other schools"
 *     optgroup appears below it, only when there are non-primary
 *     courses to show.
 *   - Self-learners (no enrollments) and unauthenticated viewers see a
 *     single "Browse by school" group containing every course — no
 *     dead empty group rendered.
 *   - Falls back to a flat list when no enrolled-school context is
 *     available (consumer didn't pass `enrolledSchoolIds`).
 *
 * Props: same as a native <select> for value/onChange/disabled/required,
 * plus:
 *   - courses        Array — flattened by `flattenSchoolsToCourses`
 *   - enrolledSchoolIds Array<string|number> — user's school ids
 *   - placeholderLabel string — default "No course"
 *   - allowEmpty     boolean — show the "no course" option (default true)
 *   - className/style — passed through to the <select>
 */
import { useMemo } from 'react'
import { partitionCoursesBySchool } from '../lib/courses'

export default function CourseSelect({
  courses,
  enrolledSchoolIds,
  value,
  onChange,
  disabled,
  required,
  id,
  name,
  ariaLabel,
  className,
  style,
  placeholderLabel = 'No course',
  allowEmpty = true,
  emptyValue = '',
}) {
  const { primary, other } = useMemo(
    () => partitionCoursesBySchool(courses || [], enrolledSchoolIds || []),
    [courses, enrolledSchoolIds],
  )

  // Render the option block in three modes:
  //   primary + other      → show two optgroups
  //   primary only         → show only "Your school"
  //   other only           → show "All courses" (no need to call out
  //                          "other" when nothing is primary)
  const hasPrimary = primary.length > 0
  const hasOther = other.length > 0

  return (
    <select
      id={id}
      name={name}
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      {allowEmpty ? <option value={emptyValue}>{placeholderLabel}</option> : null}

      {hasPrimary && hasOther ? (
        <>
          <optgroup label="Your school">
            {primary.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.code}
                {c.name ? ` — ${c.name}` : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label="Other schools">
            {other.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.code}
                {c.name ? ` — ${c.name}` : ''}
              </option>
            ))}
          </optgroup>
        </>
      ) : null}

      {hasPrimary && !hasOther
        ? primary.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.code}
              {c.name ? ` — ${c.name}` : ''}
            </option>
          ))
        : null}

      {!hasPrimary && hasOther
        ? other.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.code}
              {c.name ? ` — ${c.name}` : ''}
            </option>
          ))
        : null}
    </select>
  )
}
