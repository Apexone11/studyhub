/**
 * AuditLogSubTab — browsable audit trail for admin moderation dashboard.
 *
 * Features:
 * - Paginated audit log table with event, actor, target, resource, route, IP columns
 * - Filter by event type prefix
 * - Search by keyword (event, route, resource)
 * - Filter by specific user (actor)
 * - Export user's audit log as JSON
 * - Per-user detail view
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FONT } from '../adminConstants'
import { API } from '../../../config'

const EVENT_PREFIXES = [
  { value: '', label: 'All events' },
  { value: 'auth', label: 'Auth' },
  { value: 'admin', label: 'Admin' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'sheet', label: 'Sheets' },
  { value: 'comment', label: 'Comments' },
  { value: 'upload', label: 'Uploads' },
  { value: 'contribution', label: 'Contributions' },
  { value: 'settings', label: 'Settings' },
  { value: 'pii', label: 'PII access' },
]

const EVENT_COLORS = {
  auth: 'var(--sh-info)',
  admin: 'var(--sh-danger)',
  moderation: 'var(--sh-warning)',
  sheet: 'var(--sh-success)',
  comment: '#0d9488',
  upload: '#8b5cf6',
  contribution: '#0891b2',
  settings: '#6366f1',
  pii: 'var(--sh-danger)',
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
  const [total, setTotal] = useState(0)
  const [eventFilter, setEventFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [actorFilter, setActorFilter] = useState(null)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userSearchResults, setUserSearchResults] = useState([])
  const [userSearchOpen, setUserSearchOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const userSearchRef = useRef(null)
  const searchTimerRef = useRef(null)

  // Close user search dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (userSearchRef.current && !userSearchRef.current.contains(e.target)) {
        setUserSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: p })
      if (eventFilter) params.set('event', eventFilter)
      if (searchQuery) params.set('search', searchQuery)
      if (actorFilter) params.set('actorId', actorFilter.id)
      const data = await apiJson(`/api/admin/audit-log?${params}`)
      setEntries(data.entries || [])
      setPage(data.page || p)
      setTotalPages(data.pages || 1)
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message || 'Could not load audit log.')
    } finally {
      setLoading(false)
    }
  }, [apiJson, eventFilter, searchQuery, actorFilter])

  useEffect(() => { void load(1) }, [load])

  // User search with debounce
  function handleUserSearchInput(e) {
    const val = e.target.value
    setUserSearchQuery(val)
    clearTimeout(searchTimerRef.current)
    if (val.length < 2) {
      setUserSearchResults([])
      setUserSearchOpen(false)
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/admin/users/search?q=${encodeURIComponent(val)}&limit=8`, {
          credentials: 'include',
        })
        const data = await res.json()
        setUserSearchResults(Array.isArray(data) ? data : [])
        setUserSearchOpen(true)
      } catch {
        setUserSearchResults([])
      }
    }, 300)
  }

  function selectUser(user) {
    setActorFilter(user)
    setUserSearchQuery('')
    setUserSearchResults([])
    setUserSearchOpen(false)
  }

  function clearActorFilter() {
    setActorFilter(null)
  }

  // Search submit
  function handleSearchSubmit(e) {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
  }

  // Export handler
  async function handleExport() {
    if (!actorFilter) return
    setExporting(true)
    try {
      const res = await fetch(`${API}/api/admin/audit-log/export?userId=${actorFilter.id}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${actorFilter.username}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Filters row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Event type filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase' }}>Event type</span>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            style={selectStyle}
          >
            {EVENT_PREFIXES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase' }}>Search</span>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              placeholder="Search events, routes..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ ...selectStyle, minWidth: 180 }}
            />
            <button type="submit" style={{ ...actionBtnStyle, padding: '6px 10px' }}>
              Search
            </button>
            {searchQuery && (
              <button type="button" onClick={() => { setSearchInput(''); setSearchQuery('') }} style={{ ...actionBtnStyle, padding: '6px 10px', background: 'var(--sh-soft)', color: 'var(--sh-muted)' }}>
                Clear
              </button>
            )}
          </form>
        </div>

        {/* User filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }} ref={userSearchRef}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase' }}>Filter by user</span>
          {actorFilter ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', borderRadius: 8,
              border: '1px solid var(--sh-info-border)', background: 'var(--sh-info-bg)',
              fontSize: 12, fontWeight: 700, color: 'var(--sh-info-text)',
            }}>
              @{actorFilter.username}
              <button
                type="button"
                onClick={clearActorFilter}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-info-text)', fontSize: 14, fontWeight: 700, lineHeight: 1, padding: 0 }}
              >
                x
              </button>
            </div>
          ) : (
            <input
              type="text"
              placeholder="Search username..."
              value={userSearchQuery}
              onChange={handleUserSearchInput}
              style={{ ...selectStyle, minWidth: 160 }}
            />
          )}
          {userSearchOpen && userSearchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              marginTop: 2, background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)', borderRadius: 10,
              boxShadow: '0 6px 20px rgba(15, 23, 42, 0.1)',
              maxHeight: 240, overflowY: 'auto', minWidth: 200,
            }}>
              {userSearchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    textAlign: 'left', fontSize: 13, fontFamily: FONT,
                    color: 'var(--sh-text)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 700 }}>@{user.username}</span>
                  {user.displayName ? <span style={{ color: 'var(--sh-muted)', marginLeft: 6 }}>{user.displayName}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export button */}
        {actorFilter && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase' }}>Export</span>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              style={{
                ...actionBtnStyle,
                background: 'var(--sh-brand)',
                color: '#fff',
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? 'Exporting...' : `Export @${actorFilter.username}'s log`}
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          {total > 0 ? `${total} audit entries found` : 'Showing security-relevant audit events'}
        </span>
        {(searchQuery || actorFilter || eventFilter) && (
          <button
            type="button"
            onClick={() => {
              setEventFilter('')
              setSearchInput('')
              setSearchQuery('')
              setActorFilter(null)
            }}
            style={{ fontSize: 12, color: 'var(--sh-info-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 600 }}
          >
            Clear all filters
          </button>
        )}
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
                <th style={thStyle}>Resource</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>Method</th>
                <th style={thStyle}>IP</th>
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
                      background: `color-mix(in srgb, ${eventColor(entry.event)} 10%, transparent)`,
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
                      <button
                        type="button"
                        onClick={() => selectUser({ id: entry.actorId, username: entry.actorUsername })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--sh-heading)', fontFamily: FONT, fontSize: 12.5, padding: 0 }}
                      >
                        @{entry.actorUsername}
                      </button>
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
                        @{entry.targetUsername}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--sh-muted)' }}>--</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {entry.resource ? (
                      <span style={{ fontSize: 11, color: 'var(--sh-subtext)' }}>
                        {entry.resource}{entry.resourceId ? ` #${entry.resourceId}` : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--sh-muted)' }}>--</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span title={entry.route || ''} style={{ color: 'var(--sh-subtext)' }}>
                      {entry.route || '--'}
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
                    ) : '--'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontFamily: 'monospace' }}>
                      {entry.ipAddress || '--'}
                    </span>
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

const actionBtnStyle = {
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-text)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
  whiteSpace: 'nowrap',
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
  whiteSpace: 'nowrap',
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
