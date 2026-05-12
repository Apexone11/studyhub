import { useEffect, useMemo, useState } from 'react'
import { API } from '../../config'
import CourseListPicker from '../../components/CourseListPicker'
import { Skeleton } from '../../components/Skeleton'
import { Button, FormField, MsgList, SectionCard, Select } from './settingsShared'

export default function CoursesTab({ user, busyKey, setBusyKey, syncUser }) {
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [courseSchoolId, setCourseSchoolId] = useState(() =>
    String(user?.enrollments?.[0]?.course?.schoolId || ''),
  )
  const [selectedCourseIds, setSelectedCourseIds] = useState(() =>
    (user?.enrollments || []).map((e) => e.courseId),
  )
  const [coursesMsg, setCoursesMsg] = useState(null)

  useEffect(() => {
    if (catalog.length > 0 || catalogLoading) return

    let active = true
    Promise.resolve().then(() => {
      if (active) {
        setCatalogLoading(true)
        setCatalogError('')
      }
    })

    fetch(`${API}/api/courses/schools`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load catalog.')
        return r.json()
      })
      .then((data) => {
        if (active) setCatalog(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (active) setCatalogError(err.message || 'Could not load the course catalog.')
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })

    return () => {
      active = false
    }
  }, [catalog.length, catalogLoading])

  const selectedSchool = useMemo(
    () => catalog.find((s) => String(s.id) === String(courseSchoolId)) || null,
    [catalog, courseSchoolId],
  )

  async function handleSaveCourses() {
    setBusyKey('courses')
    setCoursesMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/courses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          schoolId: courseSchoolId ? Number(courseSchoolId) : null,
          courseIds: selectedCourseIds,
          customCourses: [],
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setCoursesMsg({ type: 'error', text: data.error || 'Could not save courses.' })
        return
      }

      if (data.user) syncUser(data.user)
      setCoursesMsg({ type: 'success', text: data.message || 'Courses updated.' })
    } catch {
      setCoursesMsg({ type: 'error', text: 'Check your connection and try again.' })
    } finally {
      setBusyKey('')
    }
  }

  return (
    <SectionCard title="Courses" subtitle="Choose the courses you want to personalize around.">
      <FormField label="School">
        <Select
          value={courseSchoolId}
          onChange={(e) => {
            setCourseSchoolId(e.target.value)
            setSelectedCourseIds([])
            setCoursesMsg(null)
          }}
        >
          <option value="">Select a school</option>
          {catalog.map((school) => (
            <option key={school.id} value={school.id}>
              {school.short} — {school.name}
              {school.city ? `, ${school.city}` : ''}
            </option>
          ))}
        </Select>
      </FormField>

      {catalogLoading && (
        <div
          style={{ marginBottom: 14, display: 'grid', gap: 8 }}
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Loading course catalog…</span>
          <Skeleton width="100%" height={40} borderRadius={10} />
          <Skeleton width="92%" height={40} borderRadius={10} />
          <Skeleton width="86%" height={40} borderRadius={10} />
        </div>
      )}

      {catalogError && (
        <div
          role="alert"
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--sh-danger-text)',
                marginBottom: 2,
              }}
            >
              We could not load the course catalog.
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-danger-text)', opacity: 0.85 }}>
              {catalogError}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCatalogError('')
              setCatalog([])
            }}
            style={{
              background: 'var(--sh-brand)',
              color: 'var(--sh-btn-primary-text)',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )}

      {selectedSchool && (selectedSchool.courses || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <CourseListPicker
            courses={selectedSchool.courses || []}
            selectedIds={selectedCourseIds}
            onToggle={(courseId) => {
              setSelectedCourseIds((current) =>
                current.includes(courseId)
                  ? current.filter((id) => id !== courseId)
                  : current.length < 10
                    ? [...current, courseId]
                    : current,
              )
            }}
            maxSelections={10}
            maxHeight={320}
          />
        </div>
      )}

      <MsgList msg={coursesMsg} />
      <Button disabled={busyKey === 'courses' || !courseSchoolId} onClick={handleSaveCourses}>
        {busyKey === 'courses' ? 'Saving...' : 'Save Courses'}
      </Button>
    </SectionCard>
  )
}
