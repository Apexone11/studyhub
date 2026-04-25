import { Link } from 'react-router-dom'
import { PAGE_SIZE, pagerButton, primaryButtonLink } from './adminConstants'

export function StatsGrid({ stats }) {
  const cards = [
    ['Users', stats.totalUsers, '#2563eb'],
    ['New This Week', stats.users?.thisWeek ?? 0, '#6366f1'],
    ['Sheets', stats.totalSheets, '#059669'],
    ['Published', stats.sheets?.published ?? 0, '#10b981'],
    ['Drafts', stats.sheets?.draft ?? 0, '#f59e0b'],
    ['Feed Posts', stats.feedPosts?.total ?? 0, '#8b5cf6'],
    ['Comments', stats.totalComments, '#7c3aed'],
    ['Flagged Requests', stats.flaggedRequests, '#dc2626'],
    ['Stars', stats.totalStars, '#f59e0b'],
    ['Notes', stats.totalNotes, '#0f766e'],
    ['Follows', stats.totalFollows, '#475569'],
    ['Reactions', stats.totalReactions, '#db2777'],
  ]

  return (
    <div className="admin-stats-grid" style={{ gap: 20 }}>
      {cards.map(([label, value, tone]) => (
        <div
          key={label}
          style={{
            background: 'var(--sh-surface)',
            borderRadius: 12,
            border: '1px solid var(--sh-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sh-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 8,
            }}
          >
            {label.toUpperCase()}
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: tone }}>{value ?? 0}</div>
        </div>
      ))}
    </div>
  )
}

export function ModerationOverview({ stats }) {
  const moderation = stats.moderation || {}
  const cards = [
    ['Pending Cases', moderation.pendingCases ?? 0, '#dc2626'],
    ['Active Strikes', moderation.activeStrikes ?? 0, '#ea580c'],
    ['Pending Appeals', moderation.pendingAppeals ?? 0, '#7c3aed'],
  ]

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>
        Moderation Status
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {cards.map(([label, value, tone]) => (
          <div
            key={label}
            style={{
              background: value > 0 ? 'var(--sh-danger-bg)' : 'var(--sh-soft)',
              borderRadius: 14,
              border:
                value > 0 ? '1px solid var(--sh-danger-border)' : '1px solid var(--sh-border)',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--sh-muted)',
                letterSpacing: '.06em',
                marginBottom: 6,
              }}
            >
              {label.toUpperCase()}
            </div>
            <div
              style={{ fontSize: 26, fontWeight: 800, color: value > 0 ? tone : 'var(--sh-muted)' }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModerationActivityLog({ actions }) {
  if (!actions || actions.length === 0) return null

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>
        Recent Moderation Activity
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {actions.map((action) => (
          <div
            key={action.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '10px 14px',
              border: '1px solid var(--sh-border)',
              borderRadius: 12,
              background: 'var(--sh-soft)',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                marginTop: 5,
                flexShrink: 0,
                background:
                  action.status === 'confirmed'
                    ? 'var(--sh-danger)'
                    : action.status === 'dismissed'
                      ? 'var(--sh-muted)'
                      : 'var(--sh-brand)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                Case #{action.id} — {action.contentType || 'content'} —{' '}
                <span
                  style={{
                    color:
                      action.status === 'confirmed'
                        ? 'var(--sh-danger)'
                        : action.status === 'dismissed'
                          ? 'var(--sh-slate-500)'
                          : 'var(--sh-info-text)',
                    textTransform: 'capitalize',
                  }}
                >
                  {action.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-slate-500)', marginTop: 2 }}>
                User: {action.user?.username || 'Unknown'}
                {action.reviewer ? ` — Reviewed by ${action.reviewer.username}` : ''}
              </div>
              {action.reviewNote ? (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-slate-600)',
                    marginTop: 4,
                    fontStyle: 'italic',
                  }}
                >
                  {action.reviewNote}
                </div>
              ) : null}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--sh-muted)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {action.updatedAt ? new Date(action.updatedAt).toLocaleDateString() : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Pager({ page, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE))
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
      }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        style={pagerButton(page <= 1)}
      >
        Prev
      </button>
      <span style={{ fontSize: 12, color: 'var(--sh-slate-500)' }}>Page {page}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        style={pagerButton(page >= totalPages)}
      >
        Next
      </button>
    </div>
  )
}

export function AccessDeniedCard({ user }) {
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-danger-border)',
        padding: '26px 24px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--sh-danger-text)',
          letterSpacing: '.08em',
          marginBottom: 10,
        }}
      >
        ACCESS DENIED
      </div>
      <h1 style={{ margin: '0 0 10px', fontSize: 24, color: 'var(--sh-heading)' }}>
        Admin access required
      </h1>
      <p
        style={{
          margin: '0 0 16px',
          fontSize: 14,
          color: 'var(--sh-slate-600)',
          lineHeight: 1.8,
          maxWidth: 720,
        }}
      >
        You are signed in as <strong>{user?.username || 'this account'}</strong>, but admin tools
        are only available to admin accounts. Your session is still active, and you can safely
        return to the regular app.
      </p>
      <Link to="/feed" style={primaryButtonLink}>
        Back to feed
      </Link>
    </section>
  )
}

const PIPELINE_BADGE_COLORS = {
  success: {
    bg: 'var(--sh-success-bg)',
    text: 'var(--sh-success-text)',
    border: 'var(--sh-success-border)',
  },
  danger: {
    bg: 'var(--sh-danger-bg)',
    text: 'var(--sh-danger-text)',
    border: 'var(--sh-danger-border)',
  },
  warning: {
    bg: 'var(--sh-warning-bg)',
    text: 'var(--sh-warning-text)',
    border: 'var(--sh-warning-border)',
  },
  info: { bg: 'var(--sh-pill-bg)', text: 'var(--sh-pill-text)', border: 'var(--sh-border)' },
  muted: { bg: 'var(--sh-soft)', text: 'var(--sh-muted)', border: 'var(--sh-border)' },
}

export function PipelineBadge({ label, type = 'muted' }) {
  const palette = PIPELINE_BADGE_COLORS[type] || PIPELINE_BADGE_COLORS.muted
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
