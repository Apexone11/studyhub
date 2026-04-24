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
 * Day 3 catch-up: the preparedness progress bar is now rendered per
 * exam row using the `preparednessPercent` column added in the
 * `20260424110200_add_preparedness_to_course_exam` migration.
 * Bar track: --sh-soft background, bar fill: --sh-brand,
 * both radius-full. "X% prepared" + "N days left" below each bar.
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
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
            {exams.map((exam) => {
              const badge = formatBadge(exam.examDate)
              // Pin to 0-100 even if the API returned something weird.
              // DB CHECK constraint guarantees the range end-to-end in
              // practice; this is belt-and-suspenders against a legacy
              // row that predates the constraint.
              const rawPercent =
                typeof exam.preparednessPercent === 'number' ? exam.preparednessPercent : 0
              const percent = Math.max(0, Math.min(100, Math.round(rawPercent)))
              return (
                <li key={exam.id} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                      </div>
                    </div>
                  </div>
                  {/* Preparedness bar. ARIA progressbar so screen
                       readers announce "62% prepared" without any
                       extra visually-hidden sibling. */}
                  <div
                    role="progressbar"
                    aria-label={`${percent}% prepared for ${exam.title}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    data-testid={`exam-preparedness-${exam.id}`}
                    style={{
                      height: 8,
                      width: '100%',
                      background: 'var(--sh-soft)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${percent}%`,
                        background: 'var(--sh-brand)',
                        borderRadius: 'var(--radius-full)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--sh-muted)',
                    }}
                  >
                    <span>{percent}% prepared</span>
                    <span>{formatRelative(exam.examDate)}</span>
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
