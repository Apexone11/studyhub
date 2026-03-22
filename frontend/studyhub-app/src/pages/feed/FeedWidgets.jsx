import { Link } from 'react-router-dom'

export function Avatar({ username, role, size = 42 }) {
  const initials = (username || '?').slice(0, 2).toUpperCase()
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
      }}
    >
      {initials}
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

export function EmptyFeed({ message }) {
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
      <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.6 }}>Posts from your classmates and followed users will appear here.</div>
    </div>
  )
}
