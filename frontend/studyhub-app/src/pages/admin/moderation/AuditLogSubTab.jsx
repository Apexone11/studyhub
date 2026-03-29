/**
 * AuditLogSubTab — browsable audit trail for admin moderation dashboard.
 *
 * Shows security-relevant events with filters for event type, actor, and date range.
 * Track D4 — Cycle D: Admin & Moderation.
 */
import { useCallback, useEffect, useState } from 'react'
import { FONT } from '../adminConstants'

const EVENT_PREFIXES = [
  { value: '', label: 'All events' },
  { value: 'auth', label: 'Auth' },
  { value: 'admin', label: 'Admin' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'sheet', label: 'Sheets' },
  { value: 'upload', label: 'Uploads' },
  { value: 'contribution', label: 'Contributions' },
  { value: 'pii', label: 'PII access' },
]

const EVENT_COLORS = {
  auth: '#6366f1',
  admin: '#dc2626',
  moderation: '#f59e0b',
  sheet: '#16a34a',
  upload: '#8b5cf6',
  contribution: '#0891b2',
  pii: '#dc2626',
}

function eventColor(event) {
  const prefix = (event || '').split('.')[0]
  return EVENT_COLORS[prefix] || 'var(--sh-muted)'
}

export default function AuditLogSubTab({ apiJson }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [eventFilter, setEventFilter] = useState('')

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: p })
      if (eventFilter) params.set('event', eventFilter)
      const data = await apiJson(`/api/admin/audit-log?${params}`)
      setEntries(data.entries || [])
      setPage(data.page || p)
      setTotalPages(data.pages || 1)
    } catch (err) {
      setError(err.message || 'Could not load audit log.')
    } finally {
      setLoading(false)
    }
  }, [apiJson, eventFilter])

  useEffect(() => { void load(1) }, [load])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          style={selectStyle}
        >
          {EVENT_PREFIXES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          Showing security-relevant audit events
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 14px', borderRadius: 12,
          background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)',
          color: 'var(--sh-danger-text)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          Loading audit log...
        </div>
      )}

      {/* Entries */}
      {!loading && entries.length === 0 && !error && (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20, textAlign: 'center', fontStyle: 'italic' }}>
          No audit entries found.
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div style={tableContainer}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>Method</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} style={trStyle}>
                  <td style={tdStyle}>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <br />
                    <span style={{ fontSize: 10, color: 'var(--sh-muted)' }}>
                      {new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: `${eventColor(entry.event)}15`,
                      color: eventColor(entry.event),
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: eventColor(entry.event),
                      }} />
                      {entry.event}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {entry.actorUsername ? (
                      <span style={{ fontWeight: 700, color: 'var(--sh-heading)' }}>
                        {entry.actorUsername}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--sh-muted)', fontStyle: 'italic' }}>system</span>
                    )}
                    {entry.actorRole && (
                      <span style={{
                        marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 4, background: entry.actorRole === 'admin' ? 'var(--sh-danger-bg)' : 'var(--sh-soft)',
                        color: entry.actorRole === 'admin' ? 'var(--sh-danger-text)' : 'var(--sh-muted)',
                      }}>
                        {entry.actorRole}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {entry.targetUsername ? (
                      <span style={{ fontWeight: 600, color: 'var(--sh-heading)' }}>
                        {entry.targetUsername}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--sh-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span title={entry.route || ''} style={{ color: 'var(--sh-subtext)' }}>
                      {entry.route || '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {entry.method ? (
                      <span style={{
                        fontWeight: 700, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: methodColor(entry.method).bg,
                        color: methodColor(entry.method).text,
                      }}>
                        {entry.method}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
            style={paginationBtn}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => void load(page + 1)}
            style={paginationBtn}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function methodColor(method) {
  switch (method) {
    case 'POST': return { bg: 'var(--sh-success-bg)', text: 'var(--sh-success-text)' }
    case 'PATCH': case 'PUT': return { bg: 'var(--sh-warning-bg)', text: 'var(--sh-warning-text)' }
    case 'DELETE': return { bg: 'var(--sh-danger-bg)', text: 'var(--sh-danger-text)' }
    default: return { bg: 'var(--sh-soft)', text: 'var(--sh-muted)' }
  }
}

const selectStyle = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-text)',
  fontSize: 12,
  fontFamily: FONT,
  fontWeight: 600,
}

const tableContainer = {
  borderRadius: 14,
  border: '1px solid var(--sh-border)',
  overflow: 'auto',
  background: 'var(--sh-surface)',
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--sh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  borderBottom: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)',
}

const tdStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--sh-border)',
  verticalAlign: 'top',
}

const trStyle = {
  transition: 'background .1s',
}

const paginationBtn = {
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-text)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONT,
}
