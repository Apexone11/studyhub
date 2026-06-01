/* ═══════════════════════════════════════════════════════════════════════════
 * CourseEquivalents.jsx — G2-4 "Equivalent at other schools"
 *
 * Given a courseId, fetches GET /api/courses/:id/equivalents and renders a
 * compact card listing every course at OTHER schools that shares a topic with
 * the current course, annotated with the linking topic's displayName.
 *
 * Self-hiding: the backend returns { equivalents: [] } when flag_course_aliasing
 * is off (fail-closed) or the course has no aliases. This component renders
 * nothing (returns null) on an empty list OR a failed/non-ok fetch, so it adds
 * no UI noise when the feature is disabled.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../config'
import { Skeleton } from './Skeleton'
import { authHeaders } from '../pages/shared/pageUtils'

export default function CourseEquivalents({ courseId }) {
  const [equivalents, setEquivalents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courseId) {
      setEquivalents([])
      setLoading(false)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    ;(async () => {
      try {
        const response = await fetch(`${API}/api/courses/${courseId}/equivalents`, {
          headers: authHeaders(),
          credentials: 'include',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && Array.isArray(data.equivalents)) {
          setEquivalents(data.equivalents)
        } else {
          setEquivalents([])
        }
      } catch (error) {
        if (error?.name === 'AbortError') return
        if (!cancelled) setEquivalents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [courseId])

  if (loading) {
    return (
      <section
        className="sh-card"
        aria-busy="true"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Skeleton width="60%" height={14} />
        <Skeleton width="100%" height={12} />
        <Skeleton width="85%" height={12} />
      </section>
    )
  }

  if (equivalents.length === 0) return null

  return (
    <section
      className="sh-card"
      aria-labelledby="course-equivalents-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <header>
        <h2 id="course-equivalents-heading" className="sh-card-title">
          Equivalent at other schools
        </h2>
        <p className="sh-card-helper">Courses that cover the same topics elsewhere</p>
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {equivalents.map((course) => {
          const topicLabel = (course.topics || [])
            .map((topic) => topic.displayName)
            .filter(Boolean)[0]
          return (
            <li key={course.id}>
              <Link
                to={`/sheets?courseId=${course.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid var(--sh-border)',
                  background: 'var(--sh-soft)',
                  textDecoration: 'none',
                  color: 'var(--sh-text)',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--sh-heading)' }}>
                  {course.code}
                  {course.name ? <span style={{ fontWeight: 500 }}> · {course.name}</span> : null}
                </span>
                <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                  {course.school?.name || 'Another school'}
                  {topicLabel ? ` · ${topicLabel}` : ''}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
