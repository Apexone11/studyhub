/**
 * RelatedWorkStrip — single reusable strip for the "Related work" UX
 * on every detail page (sheets, notes, papers, books). Wave-12.3
 * ecosystem Track 5.
 *
 * Props:
 *   - type    — 'sheet' | 'note' | 'paper' | 'book'
 *   - id      — the entity's id (string for paper/book, int for sheet/note)
 *   - title   — optional header label (defaults to "Related work")
 *
 * Backend: GET /api/related/{type}/{id}. Hard cap of 8 items total.
 * SWR-cached for 60s. Returns null when there's nothing to show.
 */
import { Link } from 'react-router-dom'
import useFetch from '../lib/useFetch'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function TypeBadge({ type }) {
  const label =
    type === 'sheet' ? 'Sheet' : type === 'note' ? 'Note' : type === 'paper' ? 'Paper' : 'Item'
  const color =
    type === 'sheet'
      ? 'var(--sh-brand)'
      : type === 'note'
        ? 'var(--sh-success)'
        : 'var(--sh-warning)'
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 6px',
        borderRadius: 4,
        background: 'var(--sh-soft)',
        color,
      }}
    >
      {label}
    </span>
  )
}

export default function RelatedWorkStrip({ type, id, title = 'Related work' }) {
  const safeType = ['sheet', 'note', 'paper', 'book'].includes(type) ? type : null
  const safeId = id != null && id !== '' ? encodeURIComponent(String(id)) : null
  const path = safeType && safeId ? `/api/related/${safeType}/${safeId}` : null
  const { data, loading } = useFetch(path, { skip: !path, swr: 60_000 })

  const items = Array.isArray(data?.items) ? data.items : []
  if (loading) return null
  if (items.length === 0) return null

  return (
    <section
      aria-label={title}
      style={{
        marginTop: 18,
        padding: '16px 18px',
        borderRadius: 14,
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        fontFamily: FONT,
      }}
    >
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--sh-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            to={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--sh-soft)',
              border: '1px solid var(--sh-border)',
              color: 'var(--sh-heading)',
              textDecoration: 'none',
              minWidth: 0,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--sh-brand)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--sh-border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
                title={item.title}
              >
                {item.title}
              </span>
              <TypeBadge type={item.type} />
            </div>
            {item.subtitle ? (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--sh-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.subtitle}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  )
}
