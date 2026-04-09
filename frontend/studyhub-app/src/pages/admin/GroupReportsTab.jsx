/**
 * GroupReportsTab — Admin review queue for study group reports.
 *
 * Lazy-loaded from AdminPage. Shows a filterable, paginated list of
 * reports. Each card shows the group, reporter, reason, details, and
 * action buttons (dismiss / warn / lock / delete).
 *
 * Uses GET /api/admin/group-reports + PATCH /api/admin/group-reports/:id.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders, FONT } from './adminConstants'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'
import UserAvatar from '../../components/UserAvatar'
import { IconFlag, IconCheck, IconLock, IconX } from '../../components/Icons'

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'warned', label: 'Warned' },
  { value: 'locked', label: 'Locked' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
]

const PAGE_SIZE = 20

export default function GroupReportsTab() {
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actingOn, setActingOn] = useState(null) // reportId currently being resolved

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const offset = (page - 1) * PAGE_SIZE
      const response = await fetch(
        `${API}/api/admin/group-reports?status=${statusFilter}&limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: authHeaders(), credentials: 'include' },
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load reports.'))
      setReports(data.reports || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { loadReports() }, [loadReports])

  async function handleAction(reportId, action) {
    if (actingOn) return
    const confirmMsg = {
      dismiss: 'Dismiss this report? The group will be restored to normal for the reporter.',
      warn: 'Warn this group? The owner will see a 7-day warning banner.',
      lock: 'Lock this group? It will become read-only until appealed.',
      delete: 'Soft-delete this group? The owner will have 30 days to appeal.',
    }
    if (!window.confirm(confirmMsg[action] || `Apply "${action}" to this report?`)) return

    setActingOn(reportId)
    try {
      const response = await fetch(`${API}/api/admin/group-reports/${reportId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, `Could not ${action} report.`))
      showToast(`Report ${action}${action === 'dismiss' ? 'ed' : action === 'lock' ? 'ed' : action === 'delete' ? 'd' : 'ed'}.`, 'success')
      void loadReports()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setActingOn(null)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: 22,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
          <IconFlag size={16} style={{ marginRight: 8, verticalAlign: '-2px', color: 'var(--sh-danger)' }} />
          Group Reports
          {total > 0 ? <span style={{ fontSize: 13, color: 'var(--sh-muted)', fontWeight: 600, marginLeft: 8 }}>({total})</span> : null}
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => { setStatusFilter(s.value); setPage(1) }}
              style={{
                padding: '5px 12px', borderRadius: 8,
                border: statusFilter === s.value ? '1px solid var(--sh-brand)' : '1px solid var(--sh-border)',
                background: statusFilter === s.value ? 'var(--sh-brand)' : 'var(--sh-surface)',
                color: statusFilter === s.value ? 'var(--sh-btn-primary-text, #fff)' : 'var(--sh-muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 16 }}>Loading...</div> : null}
      {error ? <div style={{ color: 'var(--sh-danger)', fontSize: 13, padding: 16 }}>{error}</div> : null}

      {!loading && !error && reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-muted)', fontSize: 14 }}>
          No reports matching this filter.
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            onAction={handleAction}
            actingOn={actingOn}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={paginationBtnStyle}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--sh-muted)', padding: '8px 0' }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={paginationBtnStyle}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  )
}

function ReportCard({ report, onAction, actingOn }) {
  const isPending = report.status === 'pending' || report.status === 'escalated'
  const isEscalated = report.status === 'escalated'

  return (
    <div
      style={{
        padding: '14px 16px', borderRadius: 14,
        border: isEscalated ? '2px solid var(--sh-danger-border)' : '1px solid var(--sh-border)',
        background: isEscalated ? 'var(--sh-danger-bg)' : 'var(--sh-surface)',
      }}
    >
      {/* Top row: group name + status + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <Link
            to={`/study-groups/${report.group?.id}`}
            style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)', textDecoration: 'none' }}
          >
            {report.group?.name || 'Unknown group'}
          </Link>
          <span style={{
            marginLeft: 8, padding: '2px 8px', borderRadius: 6,
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            background: report.group?.moderationStatus === 'locked' ? 'var(--sh-danger-bg)' : 'var(--sh-soft)',
            color: report.group?.moderationStatus === 'locked' ? 'var(--sh-danger-text)' : 'var(--sh-muted)',
          }}>
            {report.group?.moderationStatus || 'active'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase',
            background: isEscalated ? 'var(--sh-danger)' : 'var(--sh-warning-bg)',
            color: isEscalated ? '#fff' : 'var(--sh-warning-text)',
          }}>
            {report.status}
          </span>
          <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
            {new Date(report.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Reporter + reason */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <UserAvatar username={report.reporter?.username} avatarUrl={report.reporter?.avatarUrl} size={24} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)' }}>
          {report.reporter?.username || 'anonymous'}
        </span>
        <span style={{
          padding: '2px 8px', borderRadius: 6,
          background: 'var(--sh-info-bg)', color: 'var(--sh-brand)',
          fontSize: 11, fontWeight: 700,
        }}>
          {report.reason}
        </span>
      </div>

      {/* Details */}
      {report.details ? (
        <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.6, color: 'var(--sh-text)' }}>
          {report.details}
        </p>
      ) : null}

      {/* Resolved by */}
      {report.resolvedBy ? (
        <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginBottom: 8 }}>
          Resolved by <strong>{report.resolvedBy.username}</strong>
          {report.resolvedAt ? ` on ${new Date(report.resolvedAt).toLocaleDateString()}` : ''}
          {report.resolution ? ` — ${report.resolution}` : ''}
        </div>
      ) : null}

      {/* Actions (only for pending/escalated reports) */}
      {isPending ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button
            onClick={() => onAction(report.id, 'dismiss')}
            disabled={actingOn === report.id}
            style={actionBtnStyle('var(--sh-surface)', 'var(--sh-muted)', 'var(--sh-border)')}
          >
            <IconX size={12} /> Dismiss
          </button>
          <button
            onClick={() => onAction(report.id, 'warn')}
            disabled={actingOn === report.id}
            style={actionBtnStyle('var(--sh-warning-bg)', 'var(--sh-warning-text)', 'var(--sh-warning-border)')}
          >
            <IconFlag size={12} /> Warn
          </button>
          <button
            onClick={() => onAction(report.id, 'lock')}
            disabled={actingOn === report.id}
            style={actionBtnStyle('var(--sh-danger-bg)', 'var(--sh-danger-text)', 'var(--sh-danger-border)')}
          >
            <IconLock size={12} /> Lock
          </button>
          <button
            onClick={() => onAction(report.id, 'delete')}
            disabled={actingOn === report.id}
            style={actionBtnStyle('var(--sh-danger)', '#fff', 'var(--sh-danger)')}
          >
            <IconX size={12} /> Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

function actionBtnStyle(bg, color, border) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8,
    border: `1px solid ${border}`, background: bg, color,
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
  }
}

const paginationBtnStyle = {
  padding: '6px 14px', borderRadius: 8,
  border: '1px solid var(--sh-border)', background: 'var(--sh-surface)',
  color: 'var(--sh-muted)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: FONT,
}
