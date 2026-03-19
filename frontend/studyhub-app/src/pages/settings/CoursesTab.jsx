import { useEffect, useMemo, useState } from 'react'
import { API } from '../../config'
import { Button, FormField, MsgList, SectionCard } from './settingsShared'
import { FONT } from './settingsState'

export default function CoursesTab({ user, busyKey, setBusyKey, syncUser }) {
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [courseSchoolId, setCourseSchoolId] = useState(
    () => String(user?.enrollments?.[0]?.course?.schoolId || '')
  )
  const [selectedCourseIds, setSelectedCourseIds] = useState(
    () => (user?.enrollments || []).map((e) => e.courseId)
  )
  const [coursesMsg, setCoursesMsg] = useState(null)

  useEffect(() => {
    if (catalog.length > 0 || catalogLoading) return

    let active = true
    setCatalogLoading(true)
    setCatalogError('')

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

    return () => { active = false }
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
      setCoursesMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  return (
    <SectionCard title="Courses" subtitle="Choose the courses you want to personalize around.">
      <FormField label="School">
        <select
          value={courseSchoolId}
          onChange={(e) => {
            setCourseSchoolId(e.target.value)
            setSelectedCourseIds([])
            setCoursesMsg(null)
          }}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            fontSize: 14,
            fontFamily: FONT,
            color: '#0f172a',
          }}
        >
          <option value="">Select a school</option>
          {catalog.map((school) => (
            <option key={school.id} value={school.id}>{school.short} — {school.name}{school.city ? `, ${school.city}` : ''}</option>
          ))}
        </select>
      </FormField>

      {catalogLoading && <div style={{ marginBottom: 14, color: '#64748b', fontSize: 13 }}>Loading course catalog...</div>}

      {catalogError && (
        <div style={{ marginBottom: 14, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{catalogError}</span>
          <button
            onClick={() => { setCatalogError(''); setCatalog([]); }}
            style={{
              background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
              padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {selectedSchool && (
        <div
          style={{
            maxHeight: 320,
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            background: '#f8fafc',
            marginBottom: 16,
          }}
        >
          {(selectedSchool.courses || []).map((course) => {
            const checked = selectedCourseIds.includes(course.id)
            return (
              <label
                key={course.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderBottom: '1px solid #e2e8f0',
                  background: checked ? '#eff6ff' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelectedCourseIds((current) => (
                      checked
                        ? current.filter((id) => id !== course.id)
                        : current.length < 10
                          ? [...current, course.id]
                          : current
                    ))
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{course.code}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{course.name}{course.department ? ` · ${course.department}` : ''}</div>
                </div>
              </label>
            )
          })}
        </div>
      )}

      <MsgList msg={coursesMsg} />
      <Button disabled={busyKey === 'courses' || !courseSchoolId} onClick={handleSaveCourses}>
        {busyKey === 'courses' ? 'Saving...' : 'Save Courses'}
      </Button>
    </SectionCard>
  )
}
