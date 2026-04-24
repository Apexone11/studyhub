/* ═══════════════════════════════════════════════════════════════════════════
 * UpcomingExamsCard.jsx — Phase 2 of v2 design refresh
 *
 * Lists the viewer's next few exams with a date badge and the course code.
 * Fetches `/api/exams/upcoming?limit=3`. Flag-gated by
 * `design_v2_upcoming_exams` at the mount site (FeedPage, UserProfilePage).
 *
 * Rewritten 2026-04-24 (Day 2) to sit on the new components/ui kit:
 *   - Card + CardBody (structural container with consistent
 *     border/radius/shadow).
 *   - SkeletonCard while the fetch is in flight.
 *   - Course code renders as plain text on the meta line for now.
 *     Promoting it to <Chip variant="eyebrow"> is a Day 3 polish item
 *     once the Figma screen-context design lands.
 *
 * The handoff's richer "Biology Midterm · 62% prepared · Study now" design
 * is deferred — the schema has no `preparednessPercent` column, so
 * shipping that design would require a migration. The compact list
 * renders the real shape of the data we actually have today.
 * See the Day 2 report for the deferral note.
 *
 * Uses native Intl.DateTimeFormat for the badge — no new deps.
 * States: loading skeleton, empty, error (soft fail).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../../pages/shared/pageUtils'
import { Card, CardBody, SkeletonCard } from '../../components/ui'

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

  if (loading) {
    return <SkeletonCard data-testid="upcoming-exams-skeleton" />
  }

  return (
    <Card padding="md" aria-labelledby="upcoming-exams-heading">
      <CardBody>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
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

        {errored ? (
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
                      borderRadius: 'var(--radius-sm)',
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
                      {exam.course?.code || exam.courseCode || 'Course'}
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
      </CardBody>
    </Card>
  )
}
