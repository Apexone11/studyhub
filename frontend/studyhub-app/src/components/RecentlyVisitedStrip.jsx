/**
 * RecentlyVisitedStrip — small horizontal strip of the user's last 5
 * visited sheets/notes/papers/books. Mounts on /feed and any other
 * surface that wants the affordance. Bucket C1, wave-12.3.
 *
 * Renders nothing when the list is empty (don't waste space on
 * brand-new users).
 */
import { useRecentlyVisited } from '../lib/useRecentlyVisited'
import { Link } from 'react-router-dom'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function typeAccent(type) {
  if (type === 'sheet') return 'var(--sh-brand)'
  if (type === 'note') return 'var(--sh-success)'
  if (type === 'paper') return 'var(--sh-warning)'
  if (type === 'book') return 'var(--sh-info, var(--sh-brand))'
  return 'var(--sh-muted)'
}

export default function RecentlyVisitedStrip({ limit = 5 }) {
  const { items } = useRecentlyVisited()
  const visible = items.slice(0, limit)
  if (visible.length === 0) return null

  return (
    <section
      aria-label="Recently visited"
      style={{
        margin: '0 0 16px',
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--sh-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Recently viewed
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {visible.map((entry) => (
          <Link
            key={`${entry.type}-${entry.id}`}
            to={entry.href}
            title={entry.title}
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              gap: 4,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--sh-soft)',
              border: `1px solid var(--sh-border)`,
              borderLeft: `3px solid ${typeAccent(entry.type)}`,
              color: 'var(--sh-heading)',
              textDecoration: 'none',
              minWidth: 180,
              maxWidth: 240,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: typeAccent(entry.type),
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {entry.type}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {entry.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
