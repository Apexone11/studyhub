/* ═══════════════════════════════════════════════════════════════════════════
 * CourseListPicker.jsx — Searchable course checkbox list
 *
 * Reusable component used by RegisterScreen & CoursesTab.
 * Provides a typeahead filter above the checkbox list so users can quickly
 * find courses at schools with 70+ options, and works well on mobile.
 *
 * All colors use CSS variable tokens (--sh-*) for automatic dark mode.
 *
 * Props:
 *   courses        — array of { id, code, name, department? }
 *   selectedIds    — array of selected course IDs
 *   onToggle       — (courseId: number) => void
 *   maxSelections  — max allowed (default 10)
 *   maxHeight      — list container max-height (default 280)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useRef, useState } from 'react'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/**
 * Highlights matching substring in text with a bold span.
 */
function HighlightMatch({ text, query }) {
  if (!query) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return text

  return (
    <>
      {text.slice(0, index)}
      <strong style={{ color: 'var(--sh-pill-text)' }}>
        {text.slice(index, index + query.length)}
      </strong>
      {text.slice(index + query.length)}
    </>
  )
}

export default function CourseListPicker({
  courses = [],
  selectedIds = [],
  onToggle,
  maxSelections = 10,
  maxHeight = 280,
}) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef(null)

  const trimmed = filter.trim().toLowerCase()

  const filteredCourses = useMemo(() => {
    if (!trimmed) return courses
    return courses.filter((course) => {
      const haystack = `${course.code} ${course.name} ${course.department || ''}`.toLowerCase()
      return haystack.includes(trimmed)
    })
  }, [courses, trimmed])

  const selectedCount = selectedIds.length

  return (
    <div>
      {/* ── Search input ───────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Search ${courses.length} courses...`}
          aria-label="Filter courses"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 36px 10px 14px',
            borderRadius: 10,
            border: '1px solid var(--sh-input-border)',
            fontSize: 13,
            color: 'var(--sh-input-text)',
            outline: 'none',
            background: 'var(--sh-surface)',
            fontFamily: FONT,
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--sh-input-focus)'
            e.target.style.boxShadow = 'var(--sh-focus-ring)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--sh-input-border)'
            e.target.style.boxShadow = 'none'
          }}
        />
        {/* Search icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--sh-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      {/* ── Selection count ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          fontSize: 12,
          color: 'var(--sh-muted)',
        }}
      >
        <span>
          {selectedCount} of {maxSelections} selected
        </span>
        {trimmed && (
          <span>
            {filteredCourses.length} result{filteredCourses.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Course list ────────────────────────────────────────────── */}
      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          border: '1px solid var(--sh-border)',
          borderRadius: 12,
          background: 'var(--sh-soft)',
        }}
      >
        {filteredCourses.length === 0 && (
          <div
            style={{
              padding: '24px 14px',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--sh-muted)',
            }}
          >
            {trimmed
              ? `No courses match "${filter.trim()}"`
              : 'No courses available for this school.'}
          </div>
        )}

        {filteredCourses.map((course) => {
          const checked = selectedIds.includes(course.id)
          const atLimit = selectedCount >= maxSelections && !checked

          return (
            <label
              key={course.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                borderBottom: '1px solid var(--sh-border)',
                background: checked ? 'var(--sh-pill-bg)' : 'transparent',
                cursor: atLimit ? 'not-allowed' : 'pointer',
                opacity: atLimit ? 0.5 : 1,
                transition: 'background 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={atLimit}
                onChange={() => onToggle(course.id)}
                style={{ accentColor: 'var(--sh-brand)', flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-text)' }}>
                  <HighlightMatch text={course.code} query={trimmed} />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <HighlightMatch text={course.name} query={trimmed} />
                  {course.department ? ` · ${course.department}` : ''}
                </div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
