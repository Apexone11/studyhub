/**
 * SheetLab Reviews tab — original sheet owners review incoming contributions.
 * Shows pending/accepted/rejected contributions with diff viewer and accept/reject actions.
 * Uses PATCH /api/sheets/contributions/:id and GET /api/sheets/contributions/:id/diff.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from './sheetLabConstants'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'
import { DiffViewer } from './SheetLabPanels'

export default function SheetLabReviews({ sheet, onReviewed }) {
  const [reviewing, setReviewing] = useState(null)
  const [diffData, setDiffData] = useState({})
  const [loadingDiff, setLoadingDiff] = useState(null)

  const incoming = sheet?.incomingContributions || []
  const pending = incoming.filter((c) => c.status === 'pending')
  const reviewed = incoming.filter((c) => c.status !== 'pending')

  const handleReview = async (contributionId, action) => {
    if (reviewing) return
    setReviewing(contributionId)
    try {
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, `Could not ${action} contribution.`))
      showToast(
        action === 'accept'
          ? 'Contribution accepted! Your sheet has been updated.'
          : 'Contribution rejected.',
        action === 'accept' ? 'success' : 'info'
      )
      if (onReviewed) onReviewed()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setReviewing(null)
    }
  }

  const toggleDiff = async (contributionId) => {
    if (diffData[contributionId]) {
      setDiffData((prev) => {
        const next = { ...prev }
        delete next[contributionId]
        return next
      })
      return
    }
    setLoadingDiff(contributionId)
    try {
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}/diff`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load diff.'))
      setDiffData((prev) => ({ ...prev, [contributionId]: data.diff }))
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingDiff(null)
    }
  }

  if (incoming.length === 0) {
    return (
      <div style={emptyStyle}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>No contributions yet</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--sh-muted)' }}>
          When someone forks your sheet and submits changes, they'll appear here for you to review.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Pending contributions */}
      {pending.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <h4 style={sectionHeadingStyle}>
            Pending review ({pending.length})
          </h4>
          {pending.map((c) => (
            <ContributionCard
              key={c.id}
              contribution={c}
              showActions
              reviewing={reviewing}
              onReview={handleReview}
              diffData={diffData}
              loadingDiff={loadingDiff}
              onToggleDiff={toggleDiff}
            />
          ))}
        </div>
      ) : null}

      {/* Reviewed contributions */}
      {reviewed.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <h4 style={sectionHeadingStyle}>
            Previously reviewed ({reviewed.length})
          </h4>
          {reviewed.map((c) => (
            <ContributionCard
              key={c.id}
              contribution={c}
              showActions={false}
              reviewing={null}
              onReview={handleReview}
              diffData={diffData}
              loadingDiff={loadingDiff}
              onToggleDiff={toggleDiff}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ── Contribution card ────────────────────────────────────── */

function ContributionCard({ contribution: c, showActions, reviewing, onReview, diffData, loadingDiff, onToggleDiff }) {
  return (
    <div style={cardStyle}>
      {/* Top row: status + proposer + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={c.status} />
          <span style={{ fontSize: 13, color: 'var(--sh-heading)', fontWeight: 600 }}>
            {c.proposer?.username || 'Unknown'}
          </span>
          {c.forkSheet ? (
            <Link
              to={`/sheets/${c.forkSheet.id}`}
              style={{ fontSize: 12, color: 'var(--sh-brand, #6366f1)', textDecoration: 'underline' }}
            >
              View fork
            </Link>
          ) : null}
        </div>
        <span style={{ fontSize: 11, color: 'var(--sh-muted)', whiteSpace: 'nowrap' }}>
          {new Date(c.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Message */}
      {c.message ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.5 }}>
          {c.message}
        </p>
      ) : null}

      {/* Reviewer info */}
      {c.reviewer ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sh-muted)' }}>
          {c.status === 'accepted' ? 'Accepted' : 'Rejected'} by <strong>{c.reviewer.username}</strong>
          {c.reviewedAt ? ` on ${new Date(c.reviewedAt).toLocaleDateString()}` : ''}
        </div>
      ) : null}

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onToggleDiff(c.id)}
          disabled={loadingDiff === c.id}
          style={diffToggleStyle}
        >
          {loadingDiff === c.id ? 'Loading...' : diffData[c.id] ? 'Hide diff' : 'View diff'}
        </button>
        {showActions && c.status === 'pending' ? (
          <>
            <button
              type="button"
              onClick={() => onReview(c.id, 'accept')}
              disabled={reviewing === c.id}
              style={acceptButtonStyle}
            >
              {reviewing === c.id ? '...' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reject this contribution? The proposer will be notified.')) {
                  onReview(c.id, 'reject')
                }
              }}
              disabled={reviewing === c.id}
              style={rejectButtonStyle}
            >
              Reject
            </button>
          </>
        ) : null}
      </div>

      {/* Diff viewer */}
      {diffData[c.id] ? (
        <div style={{ marginTop: 12 }}>
          <DiffViewer diff={diffData[c.id]} title={`Changes from ${c.proposer?.username || 'fork'}`} />
        </div>
      ) : null}
    </div>
  )
}

/* ── Status badge ─────────────────────────────────────────── */

function StatusBadge({ status }) {
  const styles = {
    pending: { background: '#fef3c7', color: '#92400e' },
    accepted: { background: '#dcfce7', color: '#166534' },
    rejected: { background: '#fee2e2', color: '#991b1b' },
  }
  const s = styles[status] || styles.pending
  return (
    <span style={{
      display: 'inline-flex', fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 6, textTransform: 'capitalize', ...s,
    }}>
      {status}
    </span>
  )
}

/* ── Styles ────────────────────────────────────────────────── */

const sectionHeadingStyle = {
  margin: 0, fontSize: 13, fontWeight: 700,
  color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px',
}

const cardStyle = {
  padding: '14px 16px', borderRadius: 14,
  background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
}

const diffToggleStyle = {
  padding: '5px 10px', borderRadius: 8,
  border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
  color: 'var(--sh-muted)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const acceptButtonStyle = {
  padding: '5px 14px', borderRadius: 8, border: 'none',
  background: '#16a34a', color: '#fff',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

const rejectButtonStyle = {
  padding: '5px 14px', borderRadius: 8,
  border: '1px solid var(--sh-danger-border, #fecaca)',
  background: 'var(--sh-danger-bg, #fef2f2)',
  color: 'var(--sh-danger-text, #dc2626)',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

const emptyStyle = {
  textAlign: 'center', padding: '48px 24px',
  background: 'var(--sh-surface)', border: '1px dashed var(--sh-border)',
  borderRadius: 14,
}
