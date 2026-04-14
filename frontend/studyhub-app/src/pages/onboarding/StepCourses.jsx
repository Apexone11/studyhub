/* ═══════════════════════════════════════════════════════════════════════════
 * StepCourses -- Onboarding step 3: Pick your courses
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState, useEffect, useMemo } from 'react'
import { API } from '../../config'

const MAX_COURSES = 6

const StepCourses = forwardRef(function StepCourses({ onNext, onSkip, submitting }, ref) {
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])

  // Fetch schools (with courses) to get courses for the selected school
  useEffect(() => {
    let cancelled = false
    async function fetchSchools() {
      try {
        const res = await fetch(`${API}/api/courses/schools`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setSchools(data)
        }
      } catch {
        // Non-blocking
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchSchools()
    return () => {
      cancelled = true
    }
  }, [])

  // Determine courses to show: if the user selected a school in step 2, filter to that school's courses
  // Since we only have the progress.schoolSelected boolean (not the schoolId), show all courses
  // (the school was already enrolled, so its courses are the most relevant)
  const courses = useMemo(() => {
    const all = schools.flatMap((s) =>
      (s.courses || []).map((c) => ({ ...c, schoolName: s.name, schoolShort: s.short })),
    )
    return all
  }, [schools])

  function toggleCourse(courseId) {
    setSelectedIds((prev) => {
      if (prev.includes(courseId)) {
        return prev.filter((id) => id !== courseId)
      }
      if (prev.length >= MAX_COURSES) return prev
      return [...prev, courseId]
    })
  }

  function handleSubmit() {
    if (selectedIds.length > 0) {
      onNext({ courseIds: selectedIds })
    }
  }

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        Pick your courses
      </h2>
      <p style={styles.subtext}>
        Select up to {MAX_COURSES} courses. We will show you relevant study materials.
      </p>

      <div style={styles.counter}>
        {selectedIds.length}/{MAX_COURSES} selected
      </div>

      {loading ? (
        <div style={styles.loadingMsg}>Loading courses...</div>
      ) : courses.length === 0 ? (
        <div style={styles.emptyMsg}>
          No courses available yet. You can skip this step and add courses later.
        </div>
      ) : (
        <div style={styles.grid}>
          {courses.map((course) => {
            const isSelected = selectedIds.includes(course.id)
            const isDisabled = !isSelected && selectedIds.length >= MAX_COURSES
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => toggleCourse(course.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                style={{
                  ...styles.courseCard,
                  borderColor: isSelected ? 'var(--sh-brand)' : 'var(--sh-border)',
                  background: isSelected ? 'var(--sh-brand-soft-bg)' : 'var(--sh-surface)',
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <span style={styles.courseCode}>{course.code}</span>
                <span style={styles.courseName}>{course.name}</span>
                {course.schoolShort && (
                  <span style={styles.courseSchool}>{course.schoolShort}</span>
                )}
                {isSelected && (
                  <span style={styles.checkmark} aria-hidden="true">
                    &#10003;
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div style={styles.actions}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selectedIds.length === 0 || submitting}
          style={{
            ...styles.primaryBtn,
            opacity: selectedIds.length === 0 || submitting ? 0.5 : 1,
          }}
        >
          {submitting ? 'Saving...' : 'Next'}
        </button>
        <button type="button" onClick={onSkip} disabled={submitting} style={styles.skipLink}>
          Skip for now
        </button>
      </div>
    </div>
  )
})

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  heading: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    outline: 'none',
    margin: 0,
  },
  subtext: {
    fontSize: 'var(--type-base)',
    color: 'var(--sh-subtext)',
    lineHeight: 1.5,
    margin: 0,
  },
  counter: {
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-brand)',
    padding: '6px 12px',
    background: 'var(--sh-brand-soft-bg)',
    borderRadius: 'var(--radius-full)',
    alignSelf: 'flex-start',
  },
  loadingMsg: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    textAlign: 'center',
    padding: 'var(--space-8) 0',
  },
  emptyMsg: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    textAlign: 'center',
    padding: 'var(--space-8) 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--space-3)',
    maxHeight: 320,
    overflowY: 'auto',
    padding: '2px',
  },
  courseCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    border: '1.5px solid',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'inherit',
  },
  courseCode: {
    fontSize: 'var(--type-sm)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
  },
  courseName: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-subtext)',
    lineHeight: 1.4,
  },
  courseSchool: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 10,
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-brand)',
    fontWeight: 700,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
  },
  primaryBtn: {
    padding: '10px 32px',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    boxShadow: 'var(--sh-btn-primary-shadow)',
    transition: 'opacity 0.15s',
  },
  skipLink: {
    padding: '6px 12px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}

export default StepCourses
