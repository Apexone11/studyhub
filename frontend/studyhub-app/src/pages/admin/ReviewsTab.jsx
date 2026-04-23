/* ═══════════════════════════════════════════════════════════════════════════
 * ReviewsTab.jsx — Admin tab for managing user reviews + AI review reports
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react'
import { API } from '../../config'
import UserAvatar from '../../components/UserAvatar'
import {
  FONT,
  formatDateTime,
  tableHeadStyle,
  tableCell,
  tableCellStrong,
  filterSelectStyle,
  pagerButton,
} from './adminConstants'

const PAGE_SIZE = 10

function StarDisplay({ count, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={n <= count ? 'var(--sh-warning)' : 'none'}
          stroke={n <= count ? 'var(--sh-warning)' : 'var(--sh-border)'}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

function StatusPill({ status }) {
  const map = {
    pending: {
      bg: 'var(--sh-warning-bg)',
      color: 'var(--sh-warning-text)',
      border: 'var(--sh-warning-border)',
    },
    approved: {
      bg: 'var(--sh-success-bg)',
      color: 'var(--sh-success-text)',
      border: 'var(--sh-success-border)',
    },
    rejected: {
      bg: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger-text)',
      border: 'var(--sh-danger-border)',
    },
  }
  const s = map[status] || map.pending
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  )
}

// ── Sub-tab toggle button style ─────────────────────────────────────
function subTabStyle(active) {
  return {
    padding: '8px 18px',
    borderRadius: 8,
    border: active ? '1px solid var(--sh-brand)' : '1px solid var(--sh-border)',
    background: active ? 'var(--sh-brand)' : 'var(--sh-surface)',
    color: active ? '#fff' : 'var(--sh-subtext)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.15s ease',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ReviewsList — The existing review management table
// ═══════════════════════════════════════════════════════════════════════════

function ReviewsList() {
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
      const res = await fetch(`${API}/api/reviews/admin?${params}`, { credentials: 'include' })
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

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  async function handleAction(id, status) {
    setActionLoading(id)
    try {
      const res = await fetch(`${API}/api/reviews/admin/${id}`, {
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)' }}>
          Manage Reviews ({total})
        </h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setPage(1)
            }}
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
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-subtext)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading && !reviews.length ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20 }}>
          Loading reviews...
        </div>
      ) : !reviews.length ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          No reviews found.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}
            >
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
                      <span
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
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
                              padding: '5px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--sh-success-border)',
                              background: 'var(--sh-success-bg)',
                              color: 'var(--sh-success-text)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: actionLoading === r.id ? 'wait' : 'pointer',
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
                              padding: '5px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--sh-danger-border)',
                              background: 'var(--sh-danger-bg)',
                              color: 'var(--sh-danger-text)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: actionLoading === r.id ? 'wait' : 'pointer',
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 16,
            }}
          >
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

// ═══════════════════════════════════════════════════════════════════════════
// AI Reports — Generate and view AI-powered review analysis
// ═══════════════════════════════════════════════════════════════════════════

function safeParse(jsonStr) {
  try {
    return JSON.parse(jsonStr)
  } catch {
    return []
  }
}

function ReportCard({ report, onExpand, expanded }) {
  const strengths = safeParse(report.strengths)
  const weaknesses = safeParse(report.weaknesses)
  const improvements = safeParse(report.improvements)

  const periodLabel = `${new Date(report.periodStart).toLocaleDateString()} - ${new Date(report.periodEnd).toLocaleDateString()}`

  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        marginBottom: 14,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onExpand}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: FONT,
          textAlign: 'left',
        }}
      >
        <div>
          <div
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 4 }}
          >
            Review Report: {periodLabel}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--sh-muted)' }}>
            <span>{report.reviewCount} reviews analyzed</span>
            <span>Avg: {report.averageStars.toFixed(1)}/5</span>
            {report.generatedByUser && <span>By: {report.generatedByUser.username}</span>}
            <span>{formatDateTime(report.createdAt)}</span>
          </div>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--sh-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--sh-border)' }}>
          {/* Stats bar */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 16,
              marginBottom: 20,
              flexWrap: 'wrap',
            }}
          >
            <StatCard label="Reviews" value={report.reviewCount} color="var(--sh-info-text)" />
            <StatCard
              label="Avg Rating"
              value={`${report.averageStars.toFixed(1)}/5`}
              color="var(--sh-warning)"
            />
            <StatCard label="Strengths" value={strengths.length} color="var(--sh-success-text)" />
            <StatCard label="Issues" value={weaknesses.length} color="var(--sh-danger-text)" />
          </div>

          {/* Three columns: Strengths, Weaknesses, Improvements */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
              marginBottom: 20,
            }}
          >
            <InsightList
              title="Strengths"
              items={strengths}
              iconColor="var(--sh-success-text)"
              bgColor="var(--sh-success-bg)"
              borderColor="var(--sh-success-border)"
              icon="check"
            />
            <InsightList
              title="Weaknesses"
              items={weaknesses}
              iconColor="var(--sh-danger-text)"
              bgColor="var(--sh-danger-bg)"
              borderColor="var(--sh-danger-border)"
              icon="alert"
            />
            <InsightList
              title="Improvements"
              items={improvements}
              iconColor="var(--sh-info-text)"
              bgColor="var(--sh-info-bg)"
              borderColor="var(--sh-info-border)"
              icon="arrow"
            />
          </div>

          {/* Executive summary */}
          {report.rawAnalysis && (
            <div
              style={{
                background: 'var(--sh-soft)',
                border: '1px solid var(--sh-border)',
                borderRadius: 10,
                padding: '14px 18px',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sh-muted)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Executive Summary
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--sh-text)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {report.rawAnalysis}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: 10,
        background: 'var(--sh-soft)',
        border: '1px solid var(--sh-border)',
        minWidth: 90,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: FONT }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--sh-muted)', fontWeight: 600, marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

function InsightList({ title, items, iconColor, bgColor, borderColor, icon }) {
  if (!items.length) return null
  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: iconColor,
          marginBottom: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {title}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              fontSize: 13,
              color: 'var(--sh-text)',
              lineHeight: 1.5,
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 2 }}>
              {icon === 'check' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={iconColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {icon === 'alert' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={iconColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {icon === 'arrow' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={iconColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AIReportsPanel() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateDays, setGenerateDays] = useState(7)
  const [expandedId, setExpandedId] = useState(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/reviews/admin/reports?limit=20`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load reports')
      const data = await res.json()
      setReports(data.reports || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/reviews/admin/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days: generateDays }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.message || 'Failed to generate report')
      }
      const newReport = await res.json()
      setExpandedId(newReport.id)
      await loadReports()
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      {/* Generate controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 10,
          padding: '16px 20px',
          background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)' }}>
            AI Review Analysis
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sh-muted)' }}>
            Generate an AI-powered analysis of user reviews to identify strengths, weaknesses, and
            actionable improvements.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--sh-subtext)', fontWeight: 600 }}>
            Period:
          </label>
          <select
            value={generateDays}
            onChange={(e) => setGenerateDays(Number(e.target.value))}
            style={filterSelectStyle}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: generating ? 'var(--sh-muted)' : 'var(--sh-brand)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: generating ? 'wait' : 'pointer',
              fontFamily: FONT,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {generating && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 20 }}>
          Loading reports...
        </div>
      ) : !reports.length ? (
        <div
          style={{
            color: 'var(--sh-muted)',
            fontSize: 13,
            padding: 40,
            textAlign: 'center',
            background: 'var(--sh-surface)',
            borderRadius: 14,
            border: '1px solid var(--sh-border)',
          }}
        >
          No AI reports generated yet. Use the button above to generate your first review analysis.
        </div>
      ) : (
        reports.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            expanded={expandedId === r.id}
            onExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
          />
        ))
      )}

      {/* Inline keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Main ReviewsTab — toggles between Reviews list and AI Reports
// ═══════════════════════════════════════════════════════════════════════════

export default function ReviewsTab() {
  const [view, setView] = useState('reviews')

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sh-heading)' }}>
          User Reviews
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setView('reviews')}
            style={subTabStyle(view === 'reviews')}
          >
            Reviews
          </button>
          <button
            type="button"
            onClick={() => setView('reports')}
            style={subTabStyle(view === 'reports')}
          >
            AI Reports
          </button>
        </div>
      </div>

      {view === 'reviews' ? <ReviewsList /> : <AIReportsPanel />}
    </div>
  )
}
