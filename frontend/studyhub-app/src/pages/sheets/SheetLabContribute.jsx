/**
 * SheetLab Contribute tab — fork owners submit changes back to the original.
 * Shows existing contributions (pending/accepted/rejected) and a form to create new ones.
 * Uses POST /api/sheets/:id/contributions and GET /api/sheets/contributions/:id/diff.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from './sheetLabConstants'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'
import { DiffViewer } from './SheetLabPanels'

export default function SheetLabContribute({ sheet, onContributed }) {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [diffData, setDiffData] = useState({}) // { [contributionId]: diff }
  const [loadingDiff, setLoadingDiff] = useState(null)
  const [upstreamDiff, setUpstreamDiff] = useState(null)
  const [loadingUpstreamDiff, setLoadingUpstreamDiff] = useState(false)
  const [showUpstreamDiff, setShowUpstreamDiff] = useState(false)

  const outgoing = sheet?.outgoingContributions || []
  const hasPending = outgoing.some((c) => c.status === 'pending')
  const originalTitle = sheet?.forkSource?.title || 'the original sheet'
  const originalId = sheet?.forkOf

  const handleSyncUpstream = async () => {
    if (syncing || !sheet?.id) return
    setSyncing(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/lab/sync-upstream`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not sync.'))
      showToast(data.message || 'Synced!', data.synced ? 'success' : 'info')
      if (data.synced && onContributed) onContributed()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleCompareUpstream = async () => {
    if (showUpstreamDiff && upstreamDiff) {
      setShowUpstreamDiff(false)
      return
    }
    if (loadingUpstreamDiff || !sheet?.id) return
    setLoadingUpstreamDiff(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/lab/compare-upstream`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not compare to upstream.'))
      setUpstreamDiff(data)
      setShowUpstreamDiff(true)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingUpstreamDiff(false)
    }
  }

  const handleSubmit = async () => {
    if (submitting || !sheet?.id) return
    setSubmitting(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/contributions`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: message.trim() }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not submit contribution.'))
      showToast('Contribution submitted! The original author will be notified.', 'success')
      setMessage('')
      if (onContributed) onContributed()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
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

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Header */}
      <div style={{ ...headerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
            Contribute to original
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>
            Submit your changes to{' '}
            {originalId ? (
              <Link to={`/sheets/${originalId}`} style={{ color: 'var(--sh-brand, #6366f1)', textDecoration: 'underline' }}>
                {originalTitle}
              </Link>
            ) : (
              <strong>{originalTitle}</strong>
            )}
            {' '}for the author to review.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleCompareUpstream}
            disabled={loadingUpstreamDiff}
            style={compareButtonStyle}
          >
            {loadingUpstreamDiff ? 'Comparing...' : showUpstreamDiff ? 'Hide comparison' : 'Compare to original'}
          </button>
          <button
            type="button"
            onClick={handleSyncUpstream}
            disabled={syncing}
            style={syncButtonStyle}
          >
            {syncing ? 'Syncing...' : 'Sync from original'}
          </button>
        </div>
      </div>

      {/* Upstream comparison diff */}
      {showUpstreamDiff && upstreamDiff ? (
        <div style={comparisonBoxStyle}>
          {upstreamDiff.identical ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--sh-success-text, #166534)', background: 'var(--sh-success-bg, #f0fdf4)', borderRadius: 12, border: '1px solid var(--sh-success-border, #bbf7d0)' }}>
              Your fork is identical to the original. No differences found.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                  Differences from{' '}
                  <Link to={`/sheets/${upstreamDiff.upstream?.id}`} style={{ color: 'var(--sh-brand, #6366f1)', textDecoration: 'underline' }}>
                    {upstreamDiff.upstream?.title || 'original'}
                  </Link>
                </span>
                {upstreamDiff.summary ? (
                  <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>{upstreamDiff.summary}</span>
                ) : null}
              </div>
              <DiffViewer diff={upstreamDiff.diff} title="Your changes vs. original" />
            </>
          )}
        </div>
      ) : null}

      {/* Submit form — only if no pending contribution */}
      {!hasPending ? (
        <div style={formBoxStyle}>
          <label style={labelStyle} htmlFor="contribute-msg">Message (optional)</label>
          <textarea
            id="contribute-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder="Describe your changes..."
            maxLength={500}
            rows={3}
            style={textareaStyle}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={submitButtonStyle}
          >
            {submitting ? 'Submitting...' : 'Submit contribution'}
          </button>
        </div>
      ) : (
        <div style={pendingBannerStyle}>
          You already have a pending contribution. Wait for the author to review it before submitting another.
        </div>
      )}

      {/* Contribution history */}
      {outgoing.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Your contributions ({outgoing.length})
          </h4>
          {outgoing.map((c) => (
            <div key={c.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <StatusBadge status={c.status} />
                  {c.message ? (
                    <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--sh-heading)' }}>{c.message}</span>
                  ) : null}
                </div>
                <span style={{ fontSize: 11, color: 'var(--sh-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
              {c.reviewer ? (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sh-muted)' }}>
                  Reviewed by <strong>{c.reviewer.username}</strong>
                  {c.reviewedAt ? ` on ${new Date(c.reviewedAt).toLocaleDateString()}` : ''}
                </div>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => toggleDiff(c.id)}
                  disabled={loadingDiff === c.id}
                  style={diffToggleStyle}
                >
                  {loadingDiff === c.id ? 'Loading...' : diffData[c.id] ? 'Hide diff' : 'View diff'}
                </button>
              </div>
              {diffData[c.id] ? (
                <div style={{ marginTop: 10 }}>
                  <DiffViewer diff={diffData[c.id]} title="Proposed changes" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyStyle}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>No contributions yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sh-muted)' }}>
            When you're ready, submit your changes above for the original author to review.
          </p>
        </div>
      )}
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

const headerStyle = {
  padding: '14px 16px', borderRadius: 14,
  background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
}

const formBoxStyle = {
  padding: 16, borderRadius: 14,
  background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
  display: 'grid', gap: 10,
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px',
}

const textareaStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 10, border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)', color: 'var(--sh-heading)',
  fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
}

const submitButtonStyle = {
  justifySelf: 'start', padding: '10px 20px', borderRadius: 10,
  border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)',
  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
}

const compareButtonStyle = {
  padding: '8px 16px', borderRadius: 10, whiteSpace: 'nowrap',
  border: '1px solid #c7d2fe', background: '#eef2ff',
  color: '#4338ca', fontWeight: 700, fontSize: 12,
  cursor: 'pointer', fontFamily: 'inherit',
}

const comparisonBoxStyle = {
  padding: 16, borderRadius: 14,
  background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
}

const syncButtonStyle = {
  padding: '8px 16px', borderRadius: 10, whiteSpace: 'nowrap',
  border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
  color: 'var(--sh-heading)', fontWeight: 700, fontSize: 12,
  cursor: 'pointer', fontFamily: 'inherit',
}

const pendingBannerStyle = {
  padding: '12px 16px', borderRadius: 12, fontSize: 13,
  background: 'var(--sh-warning-bg, #fffbeb)',
  border: '1px solid var(--sh-warning-border, #fde68a)',
  color: 'var(--sh-warning-text, #92400e)',
}

const cardStyle = {
  padding: '14px 16px', borderRadius: 14,
  background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
}

const diffToggleStyle = {
  padding: '4px 10px', borderRadius: 8,
  border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
  color: 'var(--sh-muted)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const emptyStyle = {
  textAlign: 'center', padding: '40px 24px',
  background: 'var(--sh-surface)', border: '1px dashed var(--sh-border)',
  borderRadius: 14,
}
