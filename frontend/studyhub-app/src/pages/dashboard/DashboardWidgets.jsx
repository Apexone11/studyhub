/* ═══════════════════════════════════════════════════════════════════════════
 * DashboardWidgets.jsx — Presentational widget components for the Dashboard
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import {
  IconNotes,
  IconProfile,
  IconSheets,
  IconTests,
  IconUpload,
} from '../../components/Icons'

/* ── Empty state placeholder ─────────────────────────────────────────────── */
export function EmptyState({ title, body, actionLabel, actionTo }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface, #fff)',
        borderRadius: 16,
        border: '2px dashed var(--sh-border, #cbd5e1)',
        padding: '44px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ width: 52, height: 52, borderRadius: 13, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-heading, #0f172a)', marginBottom: 8 }}>{title}</div>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.7, color: 'var(--sh-muted, #64748b)' }}>{body}</p>
      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '9px 16px',
            borderRadius: 10,
            background: '#3b82f6',
            color: '#fff',
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
      <div style={{ height: 132, borderRadius: 18, background: '#dbe4f0', opacity: 0.6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} style={{ height: 112, borderRadius: 16, background: '#dbe4f0', opacity: 0.55 }} />
        ))}
      </div>
      <div style={{ height: 260, borderRadius: 18, background: '#dbe4f0', opacity: 0.45 }} />
    </div>
  )
}

/* ── Stat cards row ──────────────────────────────────────────────────────── */
export function StatCards({ statsRef, cards }) {
  return (
    <section ref={statsRef} className="dashboard-stats-grid" data-tutorial="dashboard-stats">
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '18px 18px 20px',
            boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', marginBottom: 10 }}>
            {card.label.toUpperCase()}
          </div>
          <div data-stat-value={card.value} style={{ fontSize: 32, fontWeight: 800, color: card.accent, marginBottom: 4 }}>
            {card.value}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{card.helper}</div>
        </div>
      ))}
    </section>
  )
}

/* ── Activation checklist ────────────────────────────────────────────────── */
export function ActivationChecklist({ activation }) {
  if (!activation || activation.completedCount >= activation.totalCount) return null
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '20px 22px',
        boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Getting Started</h2>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            {activation.completedCount} of {activation.totalCount} steps complete
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: `conic-gradient(#3b82f6 ${(activation.completedCount / activation.totalCount) * 360}deg, #e2e8f0 0deg)`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: '#3b82f6' }}>
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
              background: item.done ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${item.done ? '#bbf7d0' : '#e2e8f0'}`,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: item.done ? '#10b981' : '#e2e8f0',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              {item.done ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.done ? '#166534' : '#0f172a' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: item.done ? '#16a34a' : '#64748b' }}>{item.helper}</div>
            </div>
            {!item.done && item.actionPath ? (
              <Link
                to={item.actionPath}
                style={{
                  padding: '6px 12px',
                  borderRadius: 9,
                  background: '#3b82f6',
                  color: '#fff',
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
export function RecentSheets({ recentSheets }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '20px 22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Recent Sheets</h2>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Rendered from the new summary endpoint for a faster first load.
          </div>
        </div>
        <Link to="/sheets" style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textDecoration: 'none' }}>
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
                border: '1px solid #e2e8f0',
                textDecoration: 'none',
                background: '#f8fafc',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <IconSheets size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                  {sheet.title}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {sheet.course?.code || 'General'} · by {sheet.author?.username || 'unknown'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
                {sheet.stars || 0} stars
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Course focus panel ──────────────────────────────────────────────────── */
export function CourseFocus({ courses }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '20px 22px',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>Course Focus</h2>
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
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{course.code}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{course.name}</div>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
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
  { icon: IconSheets, label: 'Browse sheets', to: '/sheets', tone: '#2563eb' },
  { icon: IconUpload, label: 'Upload a new sheet', to: '/sheets/upload', tone: '#7c3aed' },
  { icon: IconTests, label: 'Open practice tests', to: '/tests', tone: '#059669' },
  { icon: IconNotes, label: 'Review your notes', to: '/notes', tone: '#db2777' },
  { icon: IconProfile, label: 'Update settings', to: '/settings', tone: '#475569' },
]

export function QuickActions() {
  return (
    <div
      data-tutorial="dashboard-actions"
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '20px 22px',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>Quick Actions</h2>
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#0f172a',
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
