/* ═══════════════════════════════════════════════════════════════════════════
 * ReviewsTab.jsx — Admin tab for managing user reviews (approve / reject)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react'
import { API } from '../../config'
import UserAvatar from '../../components/UserAvatar'
import {
  FONT, formatDateTime, tableHeadStyle, tableCell, tableCellStrong,
  filterSelectStyle, pagerButton,
} from './adminConstants'

const PAGE_SIZE = 10

function StarDisplay({ count, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24"
          fill={n <= count ? 'var(--sh-warning)' : 'none'}
          stroke={n <= count ? 'var(--sh-warning)' : 'var(--sh-border)'}
          strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

function StatusPill({ status }) {
  const map = {
    pending:  { bg: 'var(--sh-warning-bg)',  color: 'var(--sh-warning-text)',  border: 'var(--sh-warning-border)' },
    approved: { bg: 'var(--sh-success-bg)',  color: 'var(--sh-success-text)',  border: 'var(--sh-success-border)' },
    rejected: { bg: 'var(--sh-danger-bg)',   color: 'var(--sh-danger-text)',   border: 'var(--sh-danger-border)' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  )
}

export default function ReviewsTab() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState(null)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (filter !== 'all') params.set('status', filter)
      const res = await fetch(`${API}/api/admin/reviews?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load reviews')
      const data = await res.json()
      setReviews(data.reviews || data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => { void loadReviews() }, [loadReviews])

  async function handleAction(id, status) {
    setActionLoading(id)
    try {
      const res = await fetch(`${API}/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Action failed')
      await loadReviews()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sh-heading)' }}>
          User Reviews ({total})
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(1) }}
            style={filterSelectStyle}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            type="button"
            onClick={loadReviews}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)', color: 'var(--sh-subtext)', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          color: 'var(--sh-danger-text)', background: 'var(--sh-danger-bg)',
          border: '1px solid var(--sh-danger-border)', borderRadius: 12,
          padding: '12px 14px', fontSize: 13, marginBottom: 14,
        }}>
          {error}
        </div>
      )}

      {loading && !reviews.length ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20 }}>Loading reviews...</div>
      ) : !reviews.length ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          No reviews found.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
              <thead>
                <tr>
                  <th style={tableHeadStyle}>User</th>
                  <th style={tableHeadStyle}>Stars</th>
                  <th style={{ ...tableHeadStyle, minWidth: 200 }}>Review</th>
                  <th style={tableHeadStyle}>Status</th>
                  <th style={tableHeadStyle}>Date</th>
                  <th style={tableHeadStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--sh-border)' }}>
                    <td style={tableCellStrong}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <UserAvatar user={r.user} size={28} />
                        <span>{r.user?.username || 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={tableCell}>
                      <StarDisplay count={r.stars} />
                    </td>
                    <td style={{ ...tableCell, maxWidth: 300, lineHeight: 1.5 }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.text}
                      </span>
                    </td>
                    <td style={tableCell}>
                      <StatusPill status={r.status} />
                    </td>
                    <td style={{ ...tableCell, whiteSpace: 'nowrap', fontSize: 12 }}>
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td style={tableCell}>
                      {r.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            disabled={actionLoading === r.id}
                            onClick={() => handleAction(r.id, 'approved')}
                            style={{
                              padding: '5px 10px', borderRadius: 8, border: '1px solid var(--sh-success-border)',
                              background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)',
                              fontSize: 11, fontWeight: 700, cursor: actionLoading === r.id ? 'wait' : 'pointer',
                              fontFamily: FONT,
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === r.id}
                            onClick={() => handleAction(r.id, 'rejected')}
                            style={{
                              padding: '5px 10px', borderRadius: 8, border: '1px solid var(--sh-danger-border)',
                              background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)',
                              fontSize: 11, fontWeight: 700, cursor: actionLoading === r.id ? 'wait' : 'pointer',
                              fontFamily: FONT,
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--sh-muted)', fontSize: 11 }}>--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={pagerButton(page <= 1)}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={pagerButton(page >= totalPages)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
