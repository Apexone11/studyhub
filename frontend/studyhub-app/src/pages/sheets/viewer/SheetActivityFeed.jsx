/**
 * SheetActivityFeed — chronological feed of commits, contributions, and
 * comments for a sheet. Fetches GET /api/sheets/:id/activity.
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../../config'
import { authHeaders, timeAgo, FONT } from './sheetViewerConstants'
import { getApiErrorMessage, readJsonSafely } from '../../../lib/http'

const PAGE_SIZE = 20

/* ── Activity-type metadata ────────────────────────────────── */

const TYPE_META = {
  commit:                { icon: '●', color: 'var(--sh-brand, #6366f1)',         label: 'committed' },
  contribution_opened:   { icon: '⑂', color: 'var(--sh-info-text, #1d4ed8)',     label: 'opened contribution' },
  contribution_merged:   { icon: '✓', color: 'var(--sh-success-text, #166534)',   label: 'merged contribution' },
  contribution_rejected: { icon: '✕', color: 'var(--sh-danger-text, #dc2626)',    label: 'rejected contribution' },
  comment:               { icon: '\u25CB', color: 'var(--sh-muted)',               label: 'commented' },
}

/* ── Main component ────────────────────────────────────────── */

export default function SheetActivityFeed({ sheetId }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchActivity = useCallback(async (pg) => {
    if (!sheetId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/activity?page=${pg}&limit=${PAGE_SIZE}`,
        { headers: authHeaders(), credentials: 'include' },
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load activity.'))
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPage(data.page || pg)
      setTotalPages(data.totalPages || 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sheetId])

  useEffect(() => { fetchActivity(1) }, [fetchActivity])

  if (loading && items.length === 0) {
    return (
      <div style={containerStyle}>
        <h3 style={headingStyle}>Activity</h3>
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)', fontSize: 13 }}>
          Loading activity…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h3 style={headingStyle}>Activity</h3>
        <div style={errorStyle}>{error}</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={containerStyle}>
        <h3 style={headingStyle}>Activity</h3>
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)', fontSize: 13 }}>
          No activity yet.
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle} aria-label="Activity feed">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ ...headingStyle, marginBottom: 0 }}>
          Activity <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--sh-muted)' }}>({total})</span>
        </h3>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: 24 }} role="list" aria-label="Activity timeline">
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 9, top: 4, bottom: 4, width: 2,
          background: 'var(--sh-border)', borderRadius: 1,
        }} />

        {items.map((item) => {
          const meta = TYPE_META[item.type] || TYPE_META.commit
          return (
            <div key={item.id} style={itemStyle} role="listitem">
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -18, top: 4,
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--sh-surface)', border: `2px solid ${meta.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, lineHeight: 1,
              }}>
                <span style={{ color: meta.color }} aria-hidden="true">{meta.icon}</span>
              </div>

              {/* Content */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
                <span style={actorStyle}>
                  {item.actor?.avatarUrl ? (
                    <img src={item.actor.avatarUrl} alt="" loading="lazy" style={avatarStyle} />
                  ) : null}
                  {item.actor?.username || 'Unknown'}
                </span>
                <span style={{ fontSize: 12, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                <span style={timeStyle}>{timeAgo(item.date)}</span>
              </div>
              {item.message ? (
                <p style={messageStyle}>{item.message}</p>
              ) : null}
              {item.meta?.kind ? (
                <span style={kindBadgeStyle}>{item.meta.kind}</span>
              ) : null}
              {item.meta?.checksum ? (
                <span style={checksumStyle}>{item.meta.checksum}</span>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
          marginTop: 16, fontSize: 12, fontWeight: 600,
        }}>
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => fetchActivity(page - 1)}
            style={pageBtnStyle(page <= 1)}
            aria-label={`Go to previous page (currently on page ${page} of ${totalPages})`}
          >
            Previous
          </button>
          <span style={{ padding: '6px 4px', color: 'var(--sh-muted)' }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => fetchActivity(page + 1)}
            style={pageBtnStyle(page >= totalPages)}
            aria-label={`Go to next page (currently on page ${page} of ${totalPages})`}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* ── Styles ────────────────────────────────────────────────── */

const containerStyle = {
  padding: '16px 14px',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: 14,
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  overflow: 'hidden',
}

const headingStyle = {
  margin: '0 0 14px',
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--sh-heading)',
}

const errorStyle = {
  padding: '10px 14px',
  borderRadius: 10,
  background: 'var(--sh-danger-bg, #fef2f2)',
  color: 'var(--sh-danger-text, #dc2626)',
  border: '1px solid var(--sh-danger-border, #fecaca)',
  fontSize: 13,
}

const itemStyle = {
  position: 'relative',
  paddingBottom: 16,
  marginBottom: 4,
}

const actorStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--sh-heading)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
}

const avatarStyle = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  objectFit: 'cover',
  verticalAlign: 'middle',
}

const timeStyle = {
  fontSize: 11,
  color: 'var(--sh-muted)',
  fontWeight: 500,
}

const messageStyle = {
  margin: '4px 0 0',
  fontSize: 12.5,
  color: 'var(--sh-subtext, var(--sh-muted))',
  lineHeight: 1.5,
  wordBreak: 'break-word',
}

const kindBadgeStyle = {
  display: 'inline-block',
  marginTop: 4,
  padding: '1px 6px',
  borderRadius: 5,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  background: 'var(--sh-soft)',
  color: 'var(--sh-muted)',
  letterSpacing: '0.3px',
}

const checksumStyle = {
  display: 'inline-block',
  marginTop: 4,
  marginLeft: 6,
  padding: '1px 6px',
  borderRadius: 5,
  fontSize: 10,
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  background: 'var(--sh-soft)',
  color: 'var(--sh-muted)',
}

function pageBtnStyle(disabled) {
  return {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid var(--sh-border)',
    background: disabled ? 'var(--sh-soft)' : 'var(--sh-surface)',
    color: disabled ? 'var(--sh-muted)' : 'var(--sh-heading)',
    fontWeight: 600,
    fontSize: 12,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
  }
}
