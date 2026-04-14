/* ═══════════════════════════════════════════════════════════════════════════
 * DashboardWidgets.jsx — Presentational widget components for the Dashboard
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import {
  IconClock,
  IconNotes,
  IconProfile,
  IconSheets,
  IconTests,
  IconUpload,
} from '../../components/Icons'
import { timeAgo } from '../sheets/sheetsPageConstants'

/* ── Empty state placeholder ─────────────────────────────────────────────── */
export function EmptyState({ title, body, actionLabel, actionTo }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 16,
        border: '2px dashed var(--sh-border)',
        padding: '44px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 13,
          background: 'linear-gradient(135deg, var(--sh-info-bg), var(--sh-info-border))',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--sh-info)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: 'var(--sh-heading)',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <p
        style={{
          margin: '0 0 16px',
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--sh-muted)',
        }}
      >
        {body}
      </p>
      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '9px 16px',
            borderRadius: 10,
            background: 'var(--sh-brand)',
            color: 'var(--sh-btn-primary-text)',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

/* ── Loading skeleton ────────────────────────────────────────────────────── */
export function DashboardSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{ height: 132, borderRadius: 18, background: 'var(--sh-border)', opacity: 0.6 }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            style={{ height: 112, borderRadius: 16, background: 'var(--sh-border)', opacity: 0.55 }}
          />
        ))}
      </div>
      <div
        style={{ height: 260, borderRadius: 18, background: 'var(--sh-border)', opacity: 0.45 }}
      />
    </div>
  )
}

/* ── Stat cards row ──────────────────────────────────────────────────────── */
export function StatCards({ statsRef, cards }) {
  return (
    <section ref={statsRef} className="dashboard-stats-grid" data-tutorial="dashboard-stats">
      {cards.map((card) => {
        const Wrapper = card.to ? Link : 'div'
        const wrapperProps = card.to ? { to: card.to, style: { textDecoration: 'none' } } : {}
        return (
          <Wrapper key={card.label} {...wrapperProps}>
            <div
              style={{
                background: 'var(--sh-surface)',
                borderRadius: 16,
                border: '1px solid var(--sh-border)',
                padding: '18px 18px 20px',
                boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
                cursor: card.to ? 'pointer' : 'default',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--sh-muted)',
                  letterSpacing: '.08em',
                  marginBottom: 10,
                }}
              >
                {card.label.toUpperCase()}
              </div>
              <div
                data-stat-value={card.value}
                style={{ fontSize: 32, fontWeight: 800, color: card.accent, marginBottom: 4 }}
              >
                {card.value}
              </div>
              <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>{card.helper}</div>
            </div>
          </Wrapper>
        )
      })}
    </section>
  )
}

/* ── Study activity compact banner ──────────────────────────────────────── */
export function StudyActivity({ activity }) {
  if (!activity) return null
  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 14,
        border: '1px solid var(--sh-border)',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'var(--sh-success-bg)',
            color: 'var(--sh-success-text)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <IconClock size={16} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>
            {activity.weeklyCount} {activity.weeklyCount === 1 ? 'sheet' : 'sheets'} studied this
            week
          </div>
          {activity.lastStudied ? (
            <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              Last studied {timeAgo(activity.lastStudied)}
            </div>
          ) : null}
        </div>
      </div>
      <Link
        to="/sheets"
        style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-brand)', textDecoration: 'none' }}
      >
        Find more →
      </Link>
    </div>
  )
}

/* ── Activation checklist ────────────────────────────────────────────────── */
export function ActivationChecklist({ activation }) {
  if (!activation || activation.completedCount >= activation.totalCount) return null
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: '20px 22px',
        boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
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
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--sh-heading)' }}>Getting Started</h2>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 4 }}>
            {activation.completedCount} of {activation.totalCount} steps complete
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: `conic-gradient(var(--sh-brand) ${(activation.completedCount / activation.totalCount) * 360}deg, var(--sh-border) 0deg)`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'var(--sh-surface)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--sh-brand)',
            }}
          >
            {activation.completedCount}/{activation.totalCount}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {activation.checklist.map((item) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              background: item.done ? 'var(--sh-success-bg)' : 'var(--sh-soft)',
              border: `1px solid ${item.done ? 'var(--sh-success-border)' : 'var(--sh-border)'}`,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: item.done ? 'var(--sh-success)' : 'var(--sh-border)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              {item.done ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--sh-btn-primary-text)"
                  strokeWidth="3"
                  strokeLinecap="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: item.done ? 'var(--sh-success-text)' : 'var(--sh-heading)',
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: item.done ? 'var(--sh-success-text)' : 'var(--sh-subtext)',
                }}
              >
                {item.helper}
              </div>
            </div>
            {!item.done && item.actionPath ? (
              <Link
                to={item.actionPath}
                style={{
                  padding: '6px 12px',
                  borderRadius: 9,
                  background: 'var(--sh-brand)',
                  color: 'var(--sh-btn-primary-text)',
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                {item.actionLabel}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Recent sheets list ──────────────────────────────────────────────────── */
export function RecentSheets({ recentSheets, newCount = 0 }) {
  return (
    <div
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--sh-heading)' }}>Recent Sheets</h2>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 4 }}>
              Latest sheets from your enrolled courses.
            </div>
          </div>
          {newCount > 0 ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--sh-brand)',
                color: 'var(--sh-btn-primary-text)',
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.6,
              }}
            >
              {newCount} new
            </span>
          ) : null}
        </div>
        <Link
          to="/sheets"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sh-brand)',
            textDecoration: 'none',
          }}
        >
          Browse all
        </Link>
      </div>

      {recentSheets.length === 0 ? (
        <EmptyState
          title="No sheets yet"
          body="Once you or your classmates upload sheets in your enrolled courses, they will show up here."
          actionLabel="Upload your first sheet"
          actionTo="/sheets/upload"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recentSheets.map((sheet) => (
            <Link
              key={sheet.id}
              to={`/sheets/${sheet.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '42px 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid var(--sh-border)',
                textDecoration: 'none',
                background: 'var(--sh-soft)',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: 'var(--sh-brand-soft)',
                  color: 'var(--sh-brand)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <IconSheets size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--sh-heading)',
                    marginBottom: 3,
                  }}
                >
                  {sheet.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>
                  {sheet.course?.code || 'General'} · by {sheet.author?.username || 'unknown'}
                </div>
                {sheet.forkSource ? (
                  <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 2 }}>
                    Forked from {sheet.forkSource.title}
                    {sheet.forkSource.author ? ` by ${sheet.forkSource.author.username}` : ''}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', textAlign: 'right' }}>
                {sheet.stars || 0} stars
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Resume studying widget ─────────────────────────────────────────────── */
export function ResumeStudying({ entries }) {
  if (!entries || entries.length === 0) return null
  return (
    <div
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
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--sh-heading)' }}>Resume Studying</h2>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 4 }}>
            Pick up where you left off.
          </div>
        </div>
        <Link
          to="/sheets"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sh-brand)',
            textDecoration: 'none',
          }}
        >
          Browse sheets
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.slice(0, 5).map((entry) => (
          <Link
            key={entry.id}
            to={`/sheets/${entry.id}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '42px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid var(--sh-border)',
              textDecoration: 'none',
              background: 'var(--sh-soft)',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'var(--sh-accent-purple-bg)',
                color: 'var(--sh-accent-purple)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <IconClock size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--sh-heading)',
                  marginBottom: 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>
                {entry.courseCode || 'General'} · by {entry.authorUsername || 'unknown'}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--sh-muted)',
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {timeAgo(entry.viewedAt)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ── Study queue widget ─────────────────────────────────────────────────── */
export function StudyQueue({ counts, toReview, studying }) {
  const items = [...studying, ...toReview].slice(0, 4)
  if (items.length === 0 && counts.done === 0) return null
  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: '20px 22px',
      }}
    >
      <h2 style={{ margin: '0 0 10px', fontSize: 18, color: 'var(--sh-heading)' }}>Study Queue</h2>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: items.length > 0 ? 14 : 0,
          flexWrap: 'wrap',
        }}
      >
        {counts.studying > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-brand)' }}>
            {counts.studying} studying
          </span>
        ) : null}
        {counts.toReview > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-warning-text)' }}>
            {counts.toReview} to review
          </span>
        ) : null}
        {counts.done > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-success-text)' }}>
            {counts.done} done
          </span>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((entry) => (
            <Link
              key={entry.id}
              to={`/sheets/${entry.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-soft)',
                textDecoration: 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
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
                  {entry.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                  {entry.courseCode || 'General'}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background:
                    entry.status === 'studying' ? 'var(--sh-info-bg)' : 'var(--sh-warning-bg)',
                  color: entry.status === 'studying' ? 'var(--sh-brand)' : 'var(--sh-warning-text)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {entry.status === 'studying' ? 'Studying' : 'To review'}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ── Study nudges ──────────────────────────────────────────────────────────── */

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

function buildNudges(toReview, studying, done) {
  const nudges = []
  const now = Date.now()

  // Stale "to-review" items (7+ days old)
  const staleReview = toReview.filter(
    (e) => e.updatedAt && now - new Date(e.updatedAt).getTime() > SEVEN_DAYS,
  )
  if (staleReview.length > 0) {
    nudges.push({
      key: 'stale-review',
      bg: 'var(--sh-warning-bg)',
      border: 'var(--sh-warning-border)',
      color: 'var(--sh-warning-text)',
      title: `${staleReview.length} sheet${staleReview.length > 1 ? 's' : ''} waiting for review`,
      body: `You marked ${staleReview.length === 1 ? 'a sheet' : 'these sheets'} "To review" over a week ago. Time to study or clear them.`,
      link: staleReview[0]?.id ? `/sheets/${staleReview[0].id}` : '/sheets',
      action: 'Start reviewing',
    })
  }

  // Resume prompt for "studying" items not touched for 3+ days
  const staleStudying = studying.filter(
    (e) => e.updatedAt && now - new Date(e.updatedAt).getTime() > THREE_DAYS,
  )
  if (staleStudying.length > 0) {
    nudges.push({
      key: 'resume-studying',
      bg: 'var(--sh-info-bg)',
      border: 'var(--sh-info-border)',
      color: 'var(--sh-brand)',
      title: 'Resume where you left off',
      body: `${staleStudying[0].title}${staleStudying.length > 1 ? ` and ${staleStudying.length - 1} more` : ''} -- pick up your study session.`,
      link: `/sheets/${staleStudying[0].id}`,
      action: 'Continue studying',
    })
  }

  // Completion streak nudge
  if (done.length > 0 && done.length % 5 === 0) {
    nudges.push({
      key: 'streak',
      bg: 'var(--sh-success-bg)',
      border: 'var(--sh-success-border)',
      color: 'var(--sh-success-text)',
      title: `${done.length} sheets completed`,
      body: 'Great progress -- keep the momentum going.',
      link: '/sheets',
      action: 'Find more sheets',
    })
  }

  return nudges
}

export function StudyNudges({ toReview, studying, done }) {
  const nudges = buildNudges(toReview || [], studying || [], done || [])
  if (nudges.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {nudges.map((nudge) => (
        <Link
          key={nudge.key}
          to={nudge.link}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            borderRadius: 14,
            border: `1px solid ${nudge.border}`,
            background: nudge.bg,
            textDecoration: 'none',
            transition: 'box-shadow 0.15s',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: nudge.color,
                marginBottom: 3,
              }}
            >
              {nudge.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--sh-muted)',
                lineHeight: 1.5,
              }}
            >
              {nudge.body}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: nudge.color,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {nudge.action}
          </span>
        </Link>
      ))}
    </div>
  )
}

/* ── Course focus panel ──────────────────────────────────────────────────── */
export function CourseFocus({ courses }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: '20px 22px',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--sh-heading)' }}>Course Focus</h2>
      {courses.length === 0 ? (
        <EmptyState
          title="No courses selected"
          body="Add your courses so StudyHub can personalize your feed, sheets, and dashboard."
          actionLabel="Choose courses"
          actionTo="/settings?tab=courses"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courses.map((course) => (
            <div
              key={course.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                background: 'var(--sh-soft)',
                border: '1px solid var(--sh-border)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sh-heading)' }}>
                  {course.code}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>{course.name}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                {course.school?.short || course.school?.name || 'School'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Quick actions panel ─────────────────────────────────────────────────── */
const QUICK_ACTIONS = [
  { icon: IconSheets, label: 'Browse sheets', to: '/sheets', tone: 'var(--sh-info)' },
  {
    icon: IconUpload,
    label: 'Upload a new sheet',
    to: '/sheets/upload',
    tone: 'var(--sh-accent-purple)',
  },
  { icon: IconTests, label: 'Open practice tests', to: '/tests', tone: 'var(--sh-success)' },
  { icon: IconNotes, label: 'Review your notes', to: '/notes', tone: 'var(--sh-accent-pink)' },
  {
    icon: IconProfile,
    label: 'Update settings',
    to: '/settings',
    tone: 'var(--sh-neutral-soft-text)',
  },
]

export function QuickActions() {
  return (
    <div
      data-tutorial="dashboard-actions"
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: '20px 22px',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--sh-heading)' }}>
        Quick Actions
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--sh-soft)',
              border: '1px solid var(--sh-border)',
              color: 'var(--sh-heading)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <span style={{ color: action.tone, display: 'grid', placeItems: 'center' }}>
              <action.icon size={16} />
            </span>
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
