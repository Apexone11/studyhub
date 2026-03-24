import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'

export function Avatar({ username, role, size = 42, avatarUrl }) {
  const initials = (username || '?').slice(0, 2).toUpperCase()
  const [imgError, setImgError] = useState(false)
  const resolvedUrl = avatarUrl && !imgError
    ? (avatarUrl.startsWith('http') ? avatarUrl : `${API}${avatarUrl}`)
    : null

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: role === 'admin' ? 'var(--sh-brand)' : 'var(--sh-avatar-bg)',
        color: role === 'admin' ? '#fff' : 'var(--sh-avatar-text)',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.35,
        fontWeight: 800,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {resolvedUrl
        ? <img src={resolvedUrl} alt={username} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  )
}

export function Panel({ title, children, helper }) {
  return (
    <section className="sh-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 className="sh-card-title">{title}</h2>
          {helper ? <p className="sh-card-helper">{helper}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

export function LeaderboardPanel({ title, items, renderLabel, empty }) {
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => (
            <div
              key={`${title}-${item.id || item.username || index}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                paddingBottom: 10,
                borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--sh-border)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>{renderLabel(item)}</div>
                {'author' in item && item.author?.username ? (
                  <div style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>by <Link to={`/users/${item.author.username}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{item.author.username}</Link></div>
                ) : null}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sh-brand)', whiteSpace: 'nowrap' }}>
                {item.count ?? item.stars ?? item.downloads ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function EmptyFeed({ message, isFirstRun }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface, #fff)',
        borderRadius: 18,
        border: '2px dashed var(--sh-border, #cbd5e1)',
        padding: '52px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 6 }}>{message}</div>
      <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.6, marginBottom: isFirstRun ? 16 : 0 }}>
        Posts from your classmates and followed users will appear here.
      </div>
      {isFirstRun ? (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/sheets" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: 'var(--sh-brand)', color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            Browse study sheets
          </Link>
          <Link to="/sheets/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: 'var(--sh-soft)', color: 'var(--sh-heading)', border: '1px solid var(--sh-border)', padding: '8px 16px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            Upload a sheet
          </Link>
        </div>
      ) : null}
    </div>
  )
}

/* ── Getting Started card for new users ──────────────────────────────── */

const GETTING_STARTED_KEY = 'studyhub.feed.getting-started.dismissed'

const QUICK_ACTIONS = [
  {
    key: 'courses',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    label: 'Join a course',
    helper: 'Personalise your feed',
    path: '/settings?tab=courses',
    check: (u) => (u?.counts?.courses || 0) > 0,
  },
  {
    key: 'browse',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    label: 'Browse sheets',
    helper: 'See what classmates shared',
    path: '/sheets',
    check: (u) => (u?.counts?.stars || 0) > 0,
  },
  {
    key: 'upload',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    label: 'Upload a sheet',
    helper: 'Share your study materials',
    path: '/sheets/upload',
    check: (u) => (u?.counts?.sheets || 0) > 0,
  },
  {
    key: 'profile',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
    label: 'Set up your profile',
    helper: 'Add a photo and details',
    path: '/dashboard',
    check: (u) => Boolean(u?.avatarUrl),
  },
]

export function GettingStartedCard({ user }) {
  // Capture mount-time snapshot to avoid impure Date.now() in render
  const [initState] = useState(() => {
    const isDismissed = (() => { try { return localStorage.getItem(GETTING_STARTED_KEY) === '1' } catch { return false } })()
    return { isDismissed, mountTime: Date.now() }
  })
  const [dismissed, setDismissed] = useState(initState.isDismissed)

  if (dismissed || !user) return null

  const isNewUser = user.createdAt
    ? initState.mountTime - new Date(user.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
    : false
  const completedCount = QUICK_ACTIONS.filter((a) => a.check(user)).length
  if (!isNewUser && completedCount >= 3) return null

  const handleDismiss = () => {
    try { localStorage.setItem(GETTING_STARTED_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 16,
        border: '1px solid var(--sh-brand)',
        padding: '16px 18px',
        boxShadow: '0 0 0 1px var(--sh-brand-soft)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
            Welcome to StudyHub
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sh-subtext)' }}>
            Get started by completing a few steps. {completedCount > 0 ? `${completedCount} of ${QUICK_ACTIONS.length} done.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss getting started"
          style={{ background: 'none', border: 'none', color: 'var(--sh-muted)', fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
        >
          &times;
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {QUICK_ACTIONS.map((action) => {
          const done = action.check(user)
          return (
            <Link
              key={action.key}
              to={action.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: done ? 'var(--sh-success-bg)' : 'var(--sh-soft)',
                border: `1px solid ${done ? 'var(--sh-success-border)' : 'var(--sh-border)'}`,
                textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? 'var(--sh-success)' : 'var(--sh-brand)',
                color: '#fff',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : action.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: done ? 'var(--sh-success-text)' : 'var(--sh-heading)' }}>{action.label}</div>
                <div style={{ fontSize: 11, color: done ? 'var(--sh-success-text)' : 'var(--sh-muted)' }}>{done ? 'Done' : action.helper}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
