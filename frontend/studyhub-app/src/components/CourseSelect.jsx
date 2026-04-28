/**
 * CourseSelect — shared dropdown for choosing from a flattened course
 * list, optionally grouped by whether each course belongs to one of the
 * viewer's enrolled schools.
 *
 * Used by every flat-list course dropdown surface (notes editor, sheets
 * upload, AI sheet setup, study-groups create/edit). Renders a native
 * <select> and only emits <optgroup> elements when grouping actually
 * helps, so the dropdown stays theme-agnostic (browser draws it) and
 * works correctly in light and dark mode without custom CSS.
 *
 * Render modes (decided from the `partitionCoursesBySchool` output):
 *   - primary AND other → two `<optgroup>`s: "Your school" then
 *     "Other schools". This is the common case for an enrolled student
 *     whose school doesn't host the course they're after.
 *   - primary only       → flat list, no `<optgroup>` wrapper.
 *   - other only         → flat list, no `<optgroup>` wrapper. This is
 *     what a self-learner with no enrollments or an unauthenticated
 *     viewer sees, and what a multi-school self-learner sees if they
 *     haven't enrolled in any of the listed courses' schools.
 *
 * The placeholder/empty option is rendered only when `allowEmpty` is
 * true (default). Its label is `placeholderLabel` (default "No course")
 * and its value is `emptyValue` (default "") so consumers can opt out
 * of an empty selection or rename it ("Select a course…").
 *
 * Props: every standard <select> prop you'd expect (value, onChange,
 * disabled, required, id, name, className, style), plus:
 *   - courses              Array — flattened by `flattenSchoolsToCourses`
 *   - enrolledSchoolIds    Array<string|number> — viewer's school ids;
 *                          empty/missing puts everything in "other"
 *   - ariaLabel            string — accessible name for the select
 *   - placeholderLabel     string (default "No course")
 *   - allowEmpty           boolean (default true)
 *   - emptyValue           string (default "")
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

  // When `allowEmpty` is on, an undefined/null value falls back to
  // `emptyValue` so the placeholder option is always selectable. The
  // earlier `value ?? ''` shortcut broke whenever a consumer set
  // `emptyValue` to a non-empty sentinel ("__none__", etc.) — the
  // <select> ended up with a value that matched no <option> and
  // browsers rendered the first option as a phantom selection.
  const resolvedValue = value ?? (allowEmpty ? emptyValue : '')

  return (
    <select
      id={id}
      name={name}
      value={resolvedValue}
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
