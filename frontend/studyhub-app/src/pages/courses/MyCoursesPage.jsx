/* ═══════════════════════════════════════════════════════════════════════════
 * MyCoursesPage.jsx — School + course personalization hub
 *
 * Route: /my-courses
 *
 * Two-step flow (both optional):
 *   1. Choose school (search + select, or skip)
 *   2. Choose courses (multi-select with department filters)
 *
 * Saves via PATCH /api/settings/courses.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import { Skeleton } from '../../components/Skeleton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { showToast } from '../../lib/toast'
import { fadeInUp } from '../../lib/animations'
import { useTutorial } from '../../lib/useTutorial'
import { MY_COURSES_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { usePageTitle } from '../../lib/usePageTitle'

/* ── Helpers ────────────────────────────────────────────────────────────── */
const authHeaders = () => ({ 'Content-Type': 'application/json' })

function SchoolLogoCard({ school, selected, onClick, size = 'md' }) {
  const dim = size === 'sm' ? 48 : size === 'lg' ? 96 : 72
  const innerPad = size === 'sm' ? 8 : size === 'lg' ? 14 : 12
  const radius = size === 'sm' ? 12 : size === 'lg' ? 18 : 16
  const initials = (school.short || school.name || '??').slice(0, 4).toUpperCase()

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        padding: '14px 16px',
        borderRadius: radius,
        cursor: 'pointer',
        border: selected ? '2px solid var(--sh-brand)' : '1px solid var(--sh-border)',
        background: selected ? 'var(--sh-info-bg, #eff6ff)' : 'var(--sh-surface)',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
      }}
    >
      {/* Logo card */}
      <div
        style={{
          width: dim,
          height: dim,
          minWidth: dim,
          borderRadius: radius - 2,
          background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)',
          display: 'grid',
          placeItems: 'center',
          padding: innerPad,
          overflow: 'hidden',
        }}
      >
        {school.logoUrl ? (
          <img
            src={school.logoUrl.startsWith('http') ? school.logoUrl : `${API}${school.logoUrl}`}
            alt={`${school.name} logo`}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
            }}
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'grid'
            }}
          />
        ) : null}
        <div
          style={{
            display: school.logoUrl ? 'none' : 'grid',
            placeItems: 'center',
            width: '100%',
            height: '100%',
            fontSize: size === 'sm' ? 11 : size === 'lg' ? 18 : 14,
            fontWeight: 800,
            color: 'var(--sh-brand)',
            letterSpacing: '-0.02em',
          }}
        >
          {initials}
        </div>
      </div>
      {/* Name + meta */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {school.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          {school.short}
          {school.city ? ` · ${school.city}` : ''}
          {school.state ? `, ${school.state}` : ''}
        </div>
      </div>
      {/* Check badge */}
      {selected && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--sh-brand)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </button>
  )
}

function CourseChip({ course, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(course.id)}
      style={{
        padding: '8px 14px',
        borderRadius: 10,
        cursor: 'pointer',
        border: selected ? '2px solid var(--sh-brand)' : '1px solid var(--sh-border)',
        background: selected ? 'var(--sh-info-bg, #eff6ff)' : 'var(--sh-surface)',
        color: selected ? 'var(--sh-brand)' : 'var(--sh-heading)',
        fontWeight: selected ? 700 : 600,
        fontSize: 13,
        fontFamily: 'inherit',
        transition: 'all 0.12s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {selected && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span>{course.code}</span>
      <span style={{ fontWeight: 400, color: 'var(--sh-muted)', fontSize: 12 }}>{course.name}</span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Main Page Component
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function MyCoursesPage() {
  usePageTitle('My Courses')
  const tutorial = useTutorial('myCourses', MY_COURSES_STEPS, {
    version: TUTORIAL_VERSIONS.myCourses,
  })
  const { user, setSessionUser } = useSession()
  const mainRef = useCallback((node) => {
    if (node) fadeInUp(node, { duration: 400, y: 16 })
  }, [])

  /* ── Data state ──────────────────────────────────────────────────────── */
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')

  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [courseSearch, setCourseSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  /* ── Load catalog + current enrollments ─────────────────────────────── */
  useEffect(() => {
    let active = true
    setCatalogLoading(true)
    setCatalogError('')

    fetch(`${API}/api/courses/schools`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load the course catalog.')
        return r.json()
      })
      .then((data) => {
        if (!active) return
        setCatalog(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (active) setCatalogError(err.message || 'Could not load course catalog.')
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  /* ── Seed from current user enrollments ─────────────────────────────── */
  useEffect(() => {
    if (!user?.enrollments?.length) return
    const currentSchoolId = user.enrollments[0]?.course?.schoolId
    if (currentSchoolId) setSelectedSchoolId(String(currentSchoolId))
    setSelectedCourseIds(user.enrollments.map((e) => e.courseId))
  }, [user?.enrollments])

  /* ── Derived state ──────────────────────────────────────────────────── */
  const selectedSchool = useMemo(
    () => catalog.find((s) => String(s.id) === String(selectedSchoolId)) || null,
    [catalog, selectedSchoolId],
  )

  const filteredSchools = useMemo(() => {
    if (!schoolSearch.trim()) return catalog
    const q = schoolSearch.toLowerCase()
    return catalog.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.short.toLowerCase().includes(q) ||
        (s.city && s.city.toLowerCase().includes(q)),
    )
  }, [catalog, schoolSearch])

  const departments = useMemo(() => {
    if (!selectedSchool?.courses?.length) return []
    const depts = new Set()
    for (const c of selectedSchool.courses) {
      const dept = c.department || c.code.replace(/[\d\s-].*/g, '').toUpperCase()
      if (dept) depts.add(dept)
    }
    return [...depts].sort()
  }, [selectedSchool])

  const [deptFilter, setDeptFilter] = useState('')

  const filteredCourses = useMemo(() => {
    if (!selectedSchool?.courses) return []
    let courses = selectedSchool.courses
    if (deptFilter) {
      courses = courses.filter((c) => {
        const dept = c.department || c.code.replace(/[\d\s-].*/g, '').toUpperCase()
        return dept === deptFilter
      })
    }
    if (courseSearch.trim()) {
      const q = courseSearch.toLowerCase()
      courses = courses.filter(
        (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
      )
    }
    return courses
  }, [selectedSchool, deptFilter, courseSearch])

  /* ── Handlers ────────────────────────────────────────────────────────── */
  function selectSchool(schoolId) {
    const id = String(schoolId)
    if (id === selectedSchoolId) return
    setSelectedSchoolId(id)
    setSelectedCourseIds([])
    setDeptFilter('')
    setCourseSearch('')
    setDirty(true)
  }

  function clearSchool() {
    setSelectedSchoolId('')
    setSelectedCourseIds([])
    setDeptFilter('')
    setCourseSearch('')
    setDirty(true)
  }

  function toggleCourse(courseId) {
    setSelectedCourseIds((prev) => {
      const next = prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : prev.length < 10
          ? [...prev, courseId]
          : prev
      setDirty(true)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const response = await fetch(`${API}/api/settings/courses`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          schoolId: selectedSchoolId ? Number(selectedSchoolId) : null,
          courseIds: selectedCourseIds,
          customCourses: [],
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        showToast(data.error || 'Could not save courses.', 'error')
        return
      }
      if (data.user) setSessionUser(data.user)
      setDirty(false)
      showToast('Courses updated! Your feed will now reflect your selections.', 'success')
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="sh-app-page" style={{ minHeight: '100vh', background: 'var(--sh-bg)' }}>
      <Navbar crumbs={[{ label: 'My Courses', to: '/my-courses' }]} hideTabs />

      <div
        className="sh-ambient-shell sh-ambient-main"
        ref={mainRef}
        style={{
          maxWidth: 1100,
          width: '100%',
          margin: '0 auto',
          padding: '24px clamp(12px, 2vw, 20px) 60px',
          boxSizing: 'border-box',
        }}
      >
        {/* ── Hero header ─────────────────────────────────────────── */}
        <div
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            marginBottom: 24,
            background: 'linear-gradient(135deg, var(--sh-slate-800), var(--sh-brand))',
            padding: 'clamp(24px, 3vw, 40px) clamp(20px, 3vw, 36px)',
            color: 'white',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800 }}>
            Personalize Your Feed
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(13px, 1.5vw, 15px)',
              opacity: 0.85,
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            Choose your school and courses to see relevant study sheets, connect with classmates,
            and get personalized recommendations. You can change these anytime.
          </p>
        </div>

        {catalogLoading && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Skeleton width="100%" height={72} borderRadius={16} />
            <Skeleton width="100%" height={72} borderRadius={16} />
            <Skeleton width="100%" height={72} borderRadius={16} />
          </div>
        )}

        {catalogError && (
          <div
            style={{
              background: 'var(--sh-danger-bg)',
              border: '1px solid var(--sh-danger-border)',
              borderRadius: 14,
              padding: '16px 20px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--sh-danger-text)', flex: 1 }}>
              {catalogError}
            </span>
            <button
              onClick={() => {
                setCatalogError('')
                setCatalog([])
                setCatalogLoading(true)
                window.location.reload()
              }}
              style={{
                background: 'var(--sh-brand)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!catalogLoading && !catalogError && (
          <div className="profile-cockpit" style={{ gap: 24 }}>
            {/* ── Left: School + Course selection ─────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* School section */}
              <div
                data-tutorial="courses-list"
                style={{
                  background: 'var(--sh-surface)',
                  borderRadius: 18,
                  border: '1px solid var(--sh-border)',
                  padding: '20px 22px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--sh-heading)',
                      }}
                    >
                      {selectedSchool ? 'Your School' : 'Choose a School'}
                    </h2>
                    <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 3 }}>
                      {selectedSchool
                        ? 'Tap another school to switch.'
                        : 'Search or browse to find your school.'}
                    </div>
                  </div>
                  {selectedSchool && (
                    <button
                      type="button"
                      onClick={clearSchool}
                      style={{
                        background: 'none',
                        border: '1px solid var(--sh-border)',
                        borderRadius: 8,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sh-muted)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Search */}
                <input
                  type="text"
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  placeholder="Search schools..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--sh-border)',
                    background: 'var(--sh-soft)',
                    fontSize: 14,
                    color: 'var(--sh-heading)',
                    fontFamily: 'inherit',
                    marginBottom: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />

                {/* School list */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxHeight: 380,
                    overflowY: 'auto',
                  }}
                >
                  {filteredSchools.length === 0 && (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '20px 0',
                        color: 'var(--sh-muted)',
                        fontSize: 13,
                      }}
                    >
                      No schools found. Try a different search.
                    </div>
                  )}
                  {filteredSchools.map((school) => (
                    <SchoolLogoCard
                      key={school.id}
                      school={school}
                      selected={String(school.id) === selectedSchoolId}
                      onClick={() => selectSchool(school.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Course section — only when school selected */}
              {selectedSchool && (
                <div
                  data-tutorial="courses-add"
                  style={{
                    background: 'var(--sh-surface)',
                    borderRadius: 18,
                    border: '1px solid var(--sh-border)',
                    padding: '20px 22px',
                  }}
                >
                  <div style={{ marginBottom: 14 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--sh-heading)',
                      }}
                    >
                      Choose Courses
                    </h2>
                    <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 3 }}>
                      Select up to 10 courses at {selectedSchool.short || selectedSchool.name}.
                      {selectedCourseIds.length > 0 && ` ${selectedCourseIds.length}/10 selected.`}
                    </div>
                  </div>

                  {/* Department filter chips */}
                  {departments.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      <button
                        type="button"
                        onClick={() => setDeptFilter('')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          border: !deptFilter
                            ? '2px solid var(--sh-brand)'
                            : '1px solid var(--sh-border)',
                          background: !deptFilter ? 'var(--sh-info-bg, #eff6ff)' : 'var(--sh-soft)',
                          color: !deptFilter ? 'var(--sh-brand)' : 'var(--sh-muted)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        All
                      </button>
                      {departments.map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => setDeptFilter(dept === deptFilter ? '' : dept)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            border:
                              dept === deptFilter
                                ? '2px solid var(--sh-brand)'
                                : '1px solid var(--sh-border)',
                            background:
                              dept === deptFilter ? 'var(--sh-info-bg, #eff6ff)' : 'var(--sh-soft)',
                            color: dept === deptFilter ? 'var(--sh-brand)' : 'var(--sh-muted)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Course search */}
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    placeholder="Search courses..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--sh-border)',
                      background: 'var(--sh-soft)',
                      fontSize: 14,
                      color: 'var(--sh-heading)',
                      fontFamily: 'inherit',
                      marginBottom: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />

                  {/* Course chips */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      maxHeight: 360,
                      overflowY: 'auto',
                    }}
                  >
                    {filteredCourses.length === 0 && (
                      <div
                        style={{
                          padding: '16px 0',
                          color: 'var(--sh-muted)',
                          fontSize: 13,
                          width: '100%',
                          textAlign: 'center',
                        }}
                      >
                        No courses match your search.
                      </div>
                    )}
                    {filteredCourses.map((course) => (
                      <CourseChip
                        key={course.id}
                        course={course}
                        selected={selectedCourseIds.includes(course.id)}
                        onToggle={toggleCourse}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Preview panel ────────────────────────────── */}
            <div data-tutorial="courses-browse">
              <div
                style={{
                  background: 'var(--sh-surface)',
                  borderRadius: 18,
                  border: '1px solid var(--sh-border)',
                  padding: '20px 22px',
                  position: 'sticky',
                  top: 80,
                }}
              >
                <h3
                  style={{
                    margin: '0 0 12px',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--sh-heading)',
                  }}
                >
                  Feed Preview
                </h3>

                {!selectedSchool && selectedCourseIds.length === 0 && (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--sh-muted)',
                      lineHeight: 1.6,
                      marginBottom: 16,
                    }}
                  >
                    Your feed shows <strong>global trending content</strong>. Select a school and
                    courses to see personalized study sheets.
                  </div>
                )}

                {selectedSchool && (
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sh-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 6,
                      }}
                    >
                      School
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'var(--sh-soft)',
                        border: '1px solid var(--sh-border)',
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'var(--sh-surface)',
                          border: '1px solid var(--sh-border)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 10,
                          fontWeight: 800,
                          color: 'var(--sh-brand)',
                        }}
                      >
                        {(selectedSchool.short || '??').slice(0, 4)}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>
                        {selectedSchool.name}
                      </span>
                    </div>
                  </div>
                )}

                {selectedCourseIds.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sh-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 6,
                      }}
                    >
                      Courses ({selectedCourseIds.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selectedCourseIds.map((id) => {
                        const course = selectedSchool?.courses?.find((c) => c.id === id)
                        return (
                          <span
                            key={id}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              background: 'var(--sh-info-bg, #eff6ff)',
                              color: 'var(--sh-brand)',
                              border: '1px solid var(--sh-brand)',
                            }}
                          >
                            {course?.code || `#${id}`}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--sh-muted)',
                    lineHeight: 1.6,
                    marginBottom: 16,
                  }}
                >
                  {selectedSchool && selectedCourseIds.length > 0
                    ? 'Your feed will prioritize study sheets from your selected courses and school.'
                    : selectedSchool
                      ? 'Select courses to further personalize your feed.'
                      : 'Select a school to get started.'}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      borderRadius: 12,
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: saving || !dirty ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      background: saving || !dirty ? 'var(--sh-soft)' : 'var(--sh-brand)',
                      color: saving || !dirty ? 'var(--sh-muted)' : '#fff',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Up to Date'}
                  </button>
                  <Link
                    to={user ? `/users/${user.username}` : '/feed'}
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      width: '100%',
                      padding: '10px 20px',
                      borderRadius: 12,
                      border: '1px solid var(--sh-border)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--sh-muted)',
                      textDecoration: 'none',
                      background: 'transparent',
                    }}
                  >
                    {dirty ? 'Skip for Now' : 'Back to Profile'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
    </div>
  )
}
