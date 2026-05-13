/* ═══════════════════════════════════════════════════════════════════════════
 * CoursePicker.jsx — Async-search course picker with recent courses pinned.
 *
 * Wraps the existing course catalog (`courses` array, already fetched at the
 * page level via `/api/courses/schools`) with:
 *   - a debounced (250 ms) text filter that matches against code/name/school
 *   - a "Recent" section pinned at the top from `recentCoursesStorage`
 *   - a "Browse all" hand-off (collapsing back to the native <CourseSelect>
 *     dropdown) for users who'd rather scroll than search
 *
 * The picker is a controlled component: it owns the input + open-state +
 * highlighted index, but it bubbles every change up via `onChange(courseId)`
 * to keep the upload page's state model unchanged.
 *
 * Accessibility — combobox + listbox per WAI-ARIA APG:
 *   - input role=combobox, aria-expanded, aria-controls, aria-activedescendant
 *   - listbox role=listbox, items role=option with stable ids
 *   - ArrowUp/ArrowDown walks results; Enter selects highlighted; Esc closes
 *
 * Tokens only (`var(--sh-*)`). No emoji in chrome.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useDebounceValue, useOnClickOutside } from 'usehooks-ts'
import { FONT } from './uploadSheetConstants'
import CourseSelect from '../../../components/CourseSelect'
import { invalidInputStyle } from '../../../lib/useFormValidation'

const MAX_RESULTS = 12
const DEBOUNCE_MS = 250

function normaliseCourse(course) {
  if (!course || course.id == null) return null
  const code = String(course.code || '').trim()
  const name = String(course.name || '').trim()
  const schoolShort = String(course.schoolShort || course.schoolName || '').trim()
  return {
    id: String(course.id),
    code: code || `Course ${course.id}`,
    name,
    schoolShort,
    schoolId: course.schoolId != null ? String(course.schoolId) : '',
    raw: course,
  }
}

function buildLabel(course) {
  if (!course) return ''
  return course.name ? `${course.code} — ${course.name}` : course.code
}

function matchesQuery(course, q) {
  if (!q) return true
  const haystack = `${course.code} ${course.name} ${course.schoolShort}`.toLowerCase()
  return haystack.includes(q)
}

/**
 * @param {object} props
 * @param {Array}  props.courses
 * @param {Array}  props.recentCourses        prior selections (from storage)
 * @param {Array}  props.enrolledSchoolIds    used by the fallback <CourseSelect>
 * @param {string} props.value                courseId, string-coerced
 * @param {function} props.onChange           (courseId: string) => void
 * @param {boolean} props.invalid             paint the input in the danger style
 * @param {object} props.ariaProps            spread on the input (aria-invalid, aria-describedby, ref)
 */
export default function CoursePicker({
  courses,
  recentCourses,
  enrolledSchoolIds,
  value,
  onChange,
  invalid,
  ariaProps,
}) {
  /* `query` defaults to null which means "render the label derived from
   * `value`." Once the user types, the override takes over until they
   * either select a course or close the dropdown (which clears the
   * override and falls back to the derived label). This pattern keeps the
   * input fully controlled without a setState-in-effect to mirror props. */
  const [queryOverride, setQueryOverride] = useState(null)
  const [open, setOpen] = useState(false)
  const [browseAll, setBrowseAll] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const listboxId = 'course-picker-listbox'

  /* Build the normalised + dedup'd catalog once per `courses` change. */
  const catalog = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const c of courses || []) {
      const n = normaliseCourse(c)
      if (!n || seen.has(n.id)) continue
      seen.add(n.id)
      out.push(n)
    }
    return out
  }, [courses])

  const catalogById = useMemo(() => {
    const map = new Map()
    for (const c of catalog) map.set(c.id, c)
    return map
  }, [catalog])

  /* Recent courses limited to entries that still exist in the catalog. */
  const recents = useMemo(() => {
    if (!Array.isArray(recentCourses) || recentCourses.length === 0) return []
    const seen = new Set()
    const out = []
    for (const entry of recentCourses) {
      const id = String(entry?.id || '')
      if (!id || seen.has(id)) continue
      const match = catalogById.get(id)
      if (!match) continue
      seen.add(id)
      out.push(match)
    }
    return out.slice(0, 4)
  }, [recentCourses, catalogById])

  /* Label derived from the current `value`. */
  const derivedLabel = useMemo(() => {
    if (!value) return ''
    const match = catalogById.get(String(value))
    return match ? buildLabel(match) : ''
  }, [value, catalogById])

  const query = queryOverride ?? derivedLabel

  /* Debounce the input text (250 ms) via `useDebounceValue` from
   * `usehooks-ts` (Loop M30). The hook owns the timer + cleanup, returning
   * the latest value once it has been quiet for DEBOUNCE_MS. We normalise
   * the input here so the debounced output is already-trimmed-and-lowered
   * and the filter useMemo below stays simple. */
  const normalisedQuery = useMemo(() => query.trim().toLowerCase(), [query])
  const [debouncedQuery] = useDebounceValue(normalisedQuery, DEBOUNCE_MS)

  /* Compute the dropdown's display list. */
  const results = useMemo(() => {
    if (!debouncedQuery) {
      // No query → show recents first (if any), then the top of the catalog
      // bounded to MAX_RESULTS so the dropdown never feels overwhelming.
      const recentIds = new Set(recents.map((r) => r.id))
      const remaining = catalog
        .filter((c) => !recentIds.has(c.id))
        .slice(0, MAX_RESULTS - recents.length)
      return [...recents, ...remaining]
    }
    const filtered = []
    for (const c of catalog) {
      if (matchesQuery(c, debouncedQuery)) {
        filtered.push(c)
        if (filtered.length >= MAX_RESULTS) break
      }
    }
    return filtered
  }, [catalog, recents, debouncedQuery])

  /* Click outside closes the listbox + clears the typing override so the
   * input reverts to showing the current selection's label. Powered by
   * `useOnClickOutside` from `usehooks-ts` (Loop M30) — the hook attaches
   * `mousedown` + `touchstart` listeners to `document` and fires when the
   * event target is outside the supplied ref. We gate the handler on
   * `open` so a stray tap while the listbox is closed isn't a no-op
   * round-trip through setState. */
  useOnClickOutside(wrapperRef, () => {
    if (!open) return
    setOpen(false)
    setActiveIndex(-1)
    setQueryOverride(null)
  })

  const handleSelect = useCallback(
    (course) => {
      if (!course) return
      onChange?.(course.id)
      setQueryOverride(null)
      setOpen(false)
      setActiveIndex(-1)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setOpen(true)
        setActiveIndex((idx) => Math.min(results.length - 1, idx + 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setOpen(true)
        setActiveIndex((idx) => Math.max(0, idx - 1))
      } else if (event.key === 'Enter') {
        if (open && activeIndex >= 0 && results[activeIndex]) {
          event.preventDefault()
          handleSelect(results[activeIndex])
        }
      } else if (event.key === 'Escape') {
        if (open) {
          event.preventDefault()
          setOpen(false)
          setActiveIndex(-1)
        }
      }
    },
    [open, activeIndex, results, handleSelect],
  )

  /* Browse-all fallback collapses to the native <CourseSelect> dropdown so
   * keyboard / screen-reader users who prefer the OS picker keep parity. */
  if (browseAll) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <CourseSelect
          courses={courses}
          enrolledSchoolIds={enrolledSchoolIds}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          ariaLabel="Course"
          placeholderLabel="Select a course…"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: `1.5px solid ${invalid ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: FONT,
            outline: 'none',
            color: value ? 'var(--sh-text)' : 'var(--sh-muted)',
            boxSizing: 'border-box',
            ...(invalid ? invalidInputStyle(true) : null),
          }}
        />
        <button
          type="button"
          onClick={() => setBrowseAll(false)}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--sh-link, #2563eb)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
            fontFamily: FONT,
          }}
        >
          Switch to search
        </button>
      </div>
    )
  }

  const hasRecents = recents.length > 0 && !debouncedQuery

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        ref={(node) => {
          inputRef.current = node
          if (typeof ariaProps?.ref === 'function') ariaProps.ref(node)
        }}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIndex >= 0 ? `course-picker-opt-${activeIndex}` : undefined
        }
        aria-invalid={ariaProps?.['aria-invalid']}
        aria-describedby={ariaProps?.['aria-describedby']}
        data-sh-invalid={ariaProps?.['data-sh-invalid']}
        value={query}
        placeholder="Search courses by code, name, or school…"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQueryOverride(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: `1.5px solid ${invalid ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`,
          borderRadius: 8,
          fontSize: 13,
          fontFamily: FONT,
          outline: 'none',
          color: 'var(--sh-text)',
          boxSizing: 'border-box',
          ...(invalid ? invalidInputStyle(true) : null),
        }}
      />
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Course matches"
          style={{
            position: 'absolute',
            zIndex: 30,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            margin: 0,
            padding: 6,
            maxHeight: 280,
            overflowY: 'auto',
            listStyle: 'none',
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
            fontFamily: FONT,
          }}
        >
          {results.length === 0 ? (
            <li
              role="presentation"
              style={{
                padding: '10px 12px',
                fontSize: 12,
                color: 'var(--sh-muted)',
              }}
            >
              No matching courses. Try a different search term.
            </li>
          ) : (
            results.map((course, idx) => {
              const isActive = idx === activeIndex
              const isSelected = String(value || '') === course.id
              const isRecent = hasRecents && idx < recents.length
              return (
                <li
                  key={course.id}
                  id={`course-picker-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(event) => {
                    // mousedown beats the input's blur so the click still
                    // registers as a selection rather than a close-then-click.
                    event.preventDefault()
                    handleSelect(course)
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isActive
                      ? 'var(--sh-soft)'
                      : isSelected
                        ? 'var(--sh-info-bg)'
                        : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--sh-heading)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {course.code}
                      {course.name ? (
                        <span
                          style={{
                            fontWeight: 500,
                            color: 'var(--sh-slate-500)',
                          }}
                        >
                          {' '}
                          — {course.name}
                        </span>
                      ) : null}
                    </div>
                    {course.schoolShort ? (
                      <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                        {course.schoolShort}
                      </div>
                    ) : null}
                  </div>
                  {isRecent ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--sh-slate-500)',
                        background: 'var(--sh-soft)',
                        border: '1px solid var(--sh-slate-300)',
                        padding: '2px 6px',
                        borderRadius: 999,
                        letterSpacing: '.04em',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                      }}
                    >
                      Recent
                    </span>
                  ) : null}
                </li>
              )
            })
          )}
        </ul>
      ) : null}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--sh-muted)' }}>
          {hasRecents ? `${recents.length} recent` : `${catalog.length} total`}
        </span>
        <button
          type="button"
          onClick={() => setBrowseAll(true)}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--sh-link, #2563eb)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: FONT,
          }}
        >
          Browse all
        </button>
      </div>
    </div>
  )
}
