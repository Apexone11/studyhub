/**
 * SheetLab Reviews tab — original sheet owners review incoming contributions.
 * Shows pending/accepted/rejected contributions with diff viewer and accept/reject actions.
 * Uses PATCH /api/sheets/contributions/:id and GET /api/sheets/contributions/:id/diff.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../../config'
import { authHeaders } from './sheetLabConstants'
import { getApiErrorMessage, readJsonSafely } from '../../../lib/http'
import { showToast } from '../../../lib/toast'
import { DiffViewer } from './SheetLabPanels'

export default function SheetLabReviews({ sheet, onReviewed }) {
  const [reviewing, setReviewing] = useState(null)
  const [diffData, setDiffData] = useState({})       // { [contributionId]: diff }
  const [conflictFlags, setConflictFlags] = useState({}) // { [contributionId]: boolean }
  const [loadingDiff, setLoadingDiff] = useState(null)
  const [reviewComments, setReviewComments] = useState({}) // { [contributionId]: string }

  const incoming = sheet?.incomingContributions || []
  const pending = incoming.filter((c) => c.status === 'pending')
  const reviewed = incoming.filter((c) => c.status !== 'pending')

  const handleReview = async (contributionId, action) => {
    if (reviewing) return
    setReviewing(contributionId)
    try {
      const comment = (reviewComments[contributionId] || '').trim()
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ action, reviewComment: comment }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, `Could not ${action} contribution.`))
      if (data.conflictWarning) {
        showToast(data.conflictWarning, 'warning')
      }
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
      if (data.hasConflict) {
        setConflictFlags((prev) => ({ ...prev, [contributionId]: true }))
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingDiff(null)
    }
  }

  // Auto-load diff for the first pending contribution so creators see changes immediately
  const firstPendingId = pending[0]?.id
  useEffect(() => {
    if (firstPendingId && !diffData[firstPendingId]) {
      toggleDiff(firstPendingId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPendingId])

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
          <div style={attentionBannerStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {pending.length === 1
              ? '1 contribution needs your review'
              : `${pending.length} contributions need your review`}
          </div>
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
              hasConflict={conflictFlags[c.id] || false}
              reviewComment={reviewComments[c.id] || ''}
              onReviewCommentChange={(val) => setReviewComments((prev) => ({ ...prev, [c.id]: val }))}
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

function ContributionCard({ contribution: c, showActions, reviewing, onReview, diffData, loadingDiff, onToggleDiff, hasConflict, reviewComment, onReviewCommentChange }) {
  return (
    <div style={cardStyle}>
      {/* Conflict warning banner */}
      {hasConflict && showActions ? (
        <div style={conflictBannerStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>Potential conflict detected.</strong> The original sheet has been modified since this contribution was submitted. Accepting will overwrite those changes with the fork&apos;s content. Review the diff carefully before merging.
          </div>
        </div>
      ) : null}

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

      {/* Reviewer info + saved review comment */}
      {c.reviewer ? (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
            {c.status === 'accepted' ? 'Accepted' : 'Rejected'} by <strong>{c.reviewer.username}</strong>
            {c.reviewedAt ? ` on ${new Date(c.reviewedAt).toLocaleDateString()}` : ''}
          </div>
          {c.reviewComment ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--sh-heading)', lineHeight: 1.5 }}>
              {c.reviewComment}
            </p>
          ) : null}
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
              onClick={() => {
                const confirmMsg = hasConflict
                  ? 'Warning: The original sheet has changed since this contribution was submitted. Accepting will overwrite those changes. Continue?'
                  : 'Accept this contribution? Their changes will be merged into your sheet.'
                if (window.confirm(confirmMsg)) {
                  onReview(c.id, 'accept')
                }
              }}
              disabled={reviewing === c.id}
              style={hasConflict ? conflictAcceptButtonStyle : acceptButtonStyle}
            >
              {reviewing === c.id ? 'Merging...' : hasConflict ? 'Accept & Merge (conflict)' : 'Accept & Merge'}
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

      {/* Review comment textarea — shown for pending contributions when showActions is true */}
      {showActions && c.status === 'pending' ? (
        <div style={{ marginTop: 10 }}>
          <label
            htmlFor={`review-comment-${c.id}`}
            style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}
          >
            Review comment (optional)
          </label>
          <textarea
            id={`review-comment-${c.id}`}
            value={reviewComment || ''}
            onChange={(e) => onReviewCommentChange(e.target.value.slice(0, 1000))}
            placeholder="Leave feedback for the contributor..."
            maxLength={1000}
            rows={2}
            style={reviewCommentTextareaStyle}
          />
        </div>
      ) : null}

      {/* Diff viewer */}
      {diffData[c.id] ? (
        <div style={{ marginTop: 12 }}>
          {diffData[c.id].additions != null ? (
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: '#16a34a' }}>+{diffData[c.id].additions} additions</span>
              <span style={{ color: '#dc2626' }}>&minus;{diffData[c.id].deletions} deletions</span>
            </div>
          ) : null}
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

const attentionBannerStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700,
  background: 'var(--sh-warning-bg, #fffbeb)',
  border: '1px solid var(--sh-warning-border, #fde68a)',
  color: 'var(--sh-warning-text, #92400e)',
}

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

const conflictAcceptButtonStyle = {
  padding: '5px 14px', borderRadius: 8, border: '1px solid var(--sh-warning-border, #fde68a)',
  background: 'var(--sh-warning-bg, #fffbeb)', color: 'var(--sh-warning-text, #92400e)',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

const rejectButtonStyle = {
  padding: '5px 14px', borderRadius: 8,
  border: '1px solid var(--sh-danger-border, #fecaca)',
  background: 'var(--sh-danger-bg, #fef2f2)',
  color: 'var(--sh-danger-text, #dc2626)',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

const reviewCommentTextareaStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  borderRadius: 8, border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)', color: 'var(--sh-heading)',
  fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
}

const conflictBannerStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
  background: 'var(--sh-danger-bg, #fef2f2)',
  border: '1px solid var(--sh-danger-border, #fecaca)',
  color: 'var(--sh-danger-text, #dc2626)',
  marginBottom: 10,
}

const emptyStyle = {
  textAlign: 'center', padding: '48px 24px',
  background: 'var(--sh-surface)', border: '1px dashed var(--sh-border)',
  borderRadius: 14,
}
