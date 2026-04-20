/* ═══════════════════════════════════════════════════════════════════════════
 * UpcomingExamsCard.jsx — Phase 2 of v2 design refresh
 *
 * Lists the viewer's next few exams with a date badge ("APR 22") and the
 * course code. Fetches `/api/exams/upcoming?limit=3`. Flag-gated by
 * `design_v2_upcoming_exams` at the mount site (FeedPage, UserProfilePage).
 *
 * Uses native `Intl.DateTimeFormat` for the badge — no new deps (per the
 * "no package.json changes" rule in CLAUDE.md). See master plan §5.6.
 *
 * States: loading skeleton, empty ("No exams coming up"), error (soft fail).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../../pages/shared/pageUtils'

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short' })
const DAY_FMT = new Intl.DateTimeFormat('en-US', { day: '2-digit' })

function formatBadge(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { month: '—', day: '—' }
  return {
    month: MONTH_FMT.format(d).toUpperCase(),
    day: DAY_FMT.format(d),
  }
}

function formatRelative(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = d.getTime() - Date.now()
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 30) return `in ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'}`
  return `in ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}`
}

export default function UpcomingExamsCard({ limit = 3 }) {
  const [exams, setExams] = useState([])
  // Loading defaults to true on mount — no synchronous reset inside useEffect
  // because react-hooks/set-state-in-effect rejects that pattern in React 19.
  // If `limit` ever changes at runtime we take the small UX hit of not
  // re-showing the skeleton; in practice every caller hardcodes `limit`.
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    fetch(`${API}/api/exams/upcoming?limit=${limit}`, {
      headers: authHeaders(),
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then((data) => {
        if (cancelled) return
        setExams(Array.isArray(data?.exams) ? data.exams : [])
        setErrored(false)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setExams([])
        setErrored(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [limit])

  return (
    <section
      aria-labelledby="upcoming-exams-heading"
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <h3
          id="upcoming-exams-heading"
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            letterSpacing: '-0.01em',
          }}
        >
          Upcoming exams
        </h3>
      </header>

      {loading ? (
        <ul
          aria-busy="true"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}
        >
          {Array.from({ length: 2 }).map((_, index) => (
            <li
              key={index}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'var(--sh-soft)',
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  height: 10,
                  width: '55%',
                  background: 'var(--sh-soft)',
                  borderRadius: 6,
                }}
              />
            </li>
          ))}
        </ul>
      ) : errored ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          We could not load your exams. Try refreshing the page.
        </p>
      ) : exams.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          No exams coming up. Add one from a course page and it will show here.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {exams.map((exam) => {
            const badge = formatBadge(exam.examDate)
            return (
              <li key={exam.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'var(--sh-soft)',
                    border: '1px solid var(--sh-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'var(--sh-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {badge.month}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--sh-heading)',
                      lineHeight: 1,
                    }}
                  >
                    {badge.day}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--sh-heading)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {exam.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--sh-muted)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {exam.course?.code || 'Course'}
                    {exam.location ? ` · ${exam.location}` : ''}
                    {' · '}
                    {formatRelative(exam.examDate)}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
