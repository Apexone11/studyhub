/**
 * ReportGroupModal — lets a user report a group for review.
 *
 * Rendered via createPortal(document.body) because StudyGroupsPage uses
 * anime.js animated containers with CSS transforms that break position:fixed.
 *
 * Flow:
 *   1. User picks a reason from the dropdown.
 *   2. Optionally adds free-text details (500 chars).
 *   3. Clicks "Submit Report".
 *   4. POST /api/study-groups/:id/report fires.
 *   5. On success, the modal closes and the group card disappears from the
 *      user's view (reporter-hiding handled by the backend filter).
 *
 * Reporter anonymity: the modal copy makes clear that the group owner will
 * NOT be told who filed the report. This matches the backend invariant.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'
import { IconFlag } from '../../components/Icons'

const REASONS = [
  { value: 'spam', label: 'Spam or fake group' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech or discrimination' },
  { value: 'copyright', label: 'Copyrighted content without permission' },
  { value: 'impersonation', label: 'Impersonation or fake identity' },
  { value: 'sexual', label: 'Sexual or inappropriate content' },
  { value: 'other', label: 'Other (explain below)' },
]

const MAX_DETAILS = 500

export default function ReportGroupModal({ open, onClose, groupId, groupName, onReported }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset form whenever the modal opens for a new group.
  useEffect(() => {
    if (open) {
      setReason('')
      setDetails('')
    }
  }, [open, groupId])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!reason || submitting) return
    setSubmitting(true)
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/report`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason, details: details.trim() }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not submit report.'))
      }
      showToast('Report submitted. You will stop seeing this group.', 'success')
      onReported?.()
      onClose?.()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-group-title"
      style={overlayStyle}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <form onSubmit={handleSubmit} style={dialogStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--sh-danger-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconFlag size={18} style={{ color: 'var(--sh-danger)' }} />
          </div>
          <div>
            <h2
              id="report-group-title"
              style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sh-heading)' }}
            >
              Report group
            </h2>
            {groupName ? (
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 2 }}>
                {groupName}
              </div>
            ) : null}
          </div>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--sh-text)' }}>
          Our team will review your report. The group owner will be notified that their group is
          under review but will <strong>not</strong> be told who filed the report. You will stop
          seeing this group in your feed after you submit.
        </p>

        <label style={labelStyle}>
          Reason *
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            style={selectStyle}
          >
            <option value="" disabled>
              Select a reason
            </option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Details (optional, {MAX_DETAILS} chars max)
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value.slice(0, MAX_DETAILS))}
            placeholder="Give us more context so we can investigate faster..."
            maxLength={MAX_DETAILS}
            rows={3}
            style={textareaStyle}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={cancelBtnStyle}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!reason || submitting}
            style={{
              ...submitBtnStyle,
              opacity: !reason || submitting ? 0.5 : 1,
              cursor: !reason || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>
        </div>
      </form>
    </div>
  )

  return createPortal(modal, document.body)
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  padding: 16,
}

const dialogStyle = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  borderRadius: 14,
  border: '1px solid var(--sh-border)',
  padding: '20px 22px',
  maxWidth: 480,
  width: '100%',
  maxHeight: '85vh',
  overflowY: 'auto',
  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)',
}

const labelStyle = {
  display: 'grid',
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--sh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  marginBottom: 12,
}

const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  fontSize: 13,
  fontFamily: 'inherit',
}

const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  minHeight: 72,
}

const cancelBtnStyle = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const submitBtnStyle = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--sh-danger)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'inherit',
}
