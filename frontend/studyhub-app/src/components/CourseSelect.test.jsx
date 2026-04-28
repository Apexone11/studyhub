/**
 * CourseSelect.test.jsx — coverage for the shared school-scoped course
 * dropdown. Three render modes get exercised plus the placeholder /
 * value / onChange contract.
 *
 * Render modes (per partitionCoursesBySchool output):
 *   1. primary AND other → two <optgroup>s ("Your school", "Other schools")
 *   2. primary only      → flat <option> list, no <optgroup>
 *   3. other only        → flat list (self-learner / unauthenticated)
 *
 * Plus:
 *   - `allowEmpty` toggles the placeholder option
 *   - `placeholderLabel` + `emptyValue` propagate to the placeholder
 *   - onChange fires with the selected value when the user picks a course
 */
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import CourseSelect from './CourseSelect'

// Stateful wrapper so fireEvent.change actually persists — a controlled
// <select> with a fixed value="" reverts the change immediately.
function ControlledCourseSelect({ onChangeSpy, ...props }) {
  const [value, setValue] = useState(props.value ?? '')
  return (
    <CourseSelect
      {...props}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        onChangeSpy?.(e)
      }}
    />
  )
}

const courses = [
  { id: 1, code: 'CHEM101', name: 'Intro to Chem', schoolId: 10 },
  { id: 2, code: 'BIO110', name: 'Intro to Bio', schoolId: 20 },
  { id: 3, code: 'CMSC131', name: 'Programming I', schoolId: 10 },
]

function getOptgroupLabels(container) {
  return Array.from(container.querySelectorAll('optgroup')).map((g) => g.getAttribute('label'))
}

describe('CourseSelect', () => {
  it('renders both optgroups when primary AND other partitions are non-empty', () => {
    const { container } = render(
      <CourseSelect courses={courses} enrolledSchoolIds={['10']} value="" onChange={() => {}} />,
    )
    expect(getOptgroupLabels(container)).toEqual(['Your school', 'Other schools'])

    // CHEM101 + CMSC131 in school 10 → primary; BIO110 in school 20 → other
    const groups = container.querySelectorAll('optgroup')
    const primaryCodes = Array.from(groups[0].querySelectorAll('option')).map((o) => o.value)
    const otherCodes = Array.from(groups[1].querySelectorAll('option')).map((o) => o.value)
    expect(primaryCodes.sort()).toEqual(['1', '3'])
    expect(otherCodes).toEqual(['2'])
  })

  it('renders a flat option list (no optgroup) when only the primary bucket has courses', () => {
    const { container } = render(
      <CourseSelect
        courses={[courses[0], courses[2]]}
        enrolledSchoolIds={['10']}
        value=""
        onChange={() => {}}
      />,
    )
    expect(container.querySelectorAll('optgroup')).toHaveLength(0)
    // 2 course options + 1 placeholder
    expect(container.querySelectorAll('option')).toHaveLength(3)
  })

  it('renders a flat option list when there are no enrollments (everything is "other")', () => {
    const { container } = render(
      <CourseSelect courses={courses} enrolledSchoolIds={[]} value="" onChange={() => {}} />,
    )
    expect(container.querySelectorAll('optgroup')).toHaveLength(0)
    // 3 course options + 1 placeholder
    expect(container.querySelectorAll('option')).toHaveLength(4)
  })

  it('renders the default "No course" placeholder option when allowEmpty is true (default)', () => {
    render(<CourseSelect courses={courses} enrolledSchoolIds={[]} value="" onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'No course' })).toBeTruthy()
  })

  it('omits the placeholder when allowEmpty is false', () => {
    render(
      <CourseSelect
        courses={courses}
        enrolledSchoolIds={[]}
        value=""
        onChange={() => {}}
        allowEmpty={false}
      />,
    )
    expect(screen.queryByRole('option', { name: 'No course' })).toBeNull()
  })

  it('honors a custom placeholderLabel + emptyValue', () => {
    const { container } = render(
      <CourseSelect
        courses={courses}
        enrolledSchoolIds={[]}
        value=""
        onChange={() => {}}
        placeholderLabel="Select a course…"
        emptyValue="__none__"
      />,
    )
    const placeholder = container.querySelector('option')
    expect(placeholder.textContent).toBe('Select a course…')
    expect(placeholder.value).toBe('__none__')
  })

  it('forwards onChange with the selected option value', () => {
    const onChangeSpy = vi.fn()
    const { container } = render(
      <ControlledCourseSelect
        courses={courses}
        enrolledSchoolIds={['10']}
        onChangeSpy={onChangeSpy}
      />,
    )
    const select = container.querySelector('select')
    fireEvent.change(select, { target: { value: '2' } })
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    expect(onChangeSpy.mock.calls[0][0].target.value).toBe('2')
    expect(select.value).toBe('2')
  })

  it('reflects the controlled value', () => {
    const { container } = render(
      <CourseSelect courses={courses} enrolledSchoolIds={['10']} value="3" onChange={() => {}} />,
    )
    expect(container.querySelector('select').value).toBe('3')
  })

  it('passes ariaLabel through to the underlying <select>', () => {
    const { container } = render(
      <CourseSelect
        courses={courses}
        enrolledSchoolIds={[]}
        value=""
        onChange={() => {}}
        ariaLabel="Course"
      />,
    )
    expect(container.querySelector('select').getAttribute('aria-label')).toBe('Course')
  })
})
