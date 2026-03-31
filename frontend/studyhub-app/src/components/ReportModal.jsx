/* ═══════════════════════════════════════════════════════════════════════════
 * ReportModal.jsx — User-facing content/user reporting dialog
 *
 * Props:
 *  open          — boolean
 *  targetType    — 'sheet' | 'note' | 'post' | 'sheet_comment' | 'post_comment' | 'note_comment' | 'user'
 *  targetId      — number
 *  onClose       — callback when modal is dismissed
 *  onReported    — optional callback after successful submission
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../config'
import { useFocusTrap } from '../lib/useFocusTrap'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

const REASON_CATEGORIES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'violence', label: 'Violence' },
  { value: 'sexual', label: 'Sexual content' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'spam', label: 'Spam' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'plagiarism', label: 'Plagiarism' },
  { value: 'other', label: 'Other' },
]

const TARGET_LABELS = {
  sheet: 'study sheet',
  note: 'note',
  post: 'post',
  sheet_comment: 'comment',
  post_comment: 'comment',
  note_comment: 'comment',
  user: 'user',
}

export default function ReportModal({ open, targetType, targetId, onClose, onReported }) {
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const trapRef = useFocusTrap({ active: open, onClose })

  /* Reset state on open */
  useEffect(() => {
    if (open) {
      setCategory('')
      setNote('')
      setError('')
      setSuccess(false)
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!category) { setError('Please select a reason.'); return }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/moderation/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetType,
          targetId,
          reasonCategory: category,
          note: note.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to submit report.')
        return
      }

      setSuccess(true)
      onReported?.(data)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const label = TARGET_LABELS[targetType] || 'content'

  return (
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        {success ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#10003;</div>
            <h3 style={styles.title}>Report submitted</h3>
            <p style={styles.message}>
              Thank you for helping keep StudyHub safe. We&apos;ll review this {label} shortly.
            </p>
            <button type="button" onClick={onClose} style={styles.primaryBtn}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 id="report-modal-title" style={styles.title}>
              Report {label}
            </h3>
            <p style={styles.message}>
              Select the reason that best describes why you&apos;re reporting this {label}.
            </p>

            <div style={styles.reasonGrid}>
              {REASON_CATEGORIES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { setCategory(r.value); setError('') }}
                  style={{
                    ...styles.reasonChip,
                    background: category === r.value ? 'var(--sh-brand)' : 'var(--sh-soft)',
                    color: category === r.value ? '#fff' : 'var(--sh-subtext)',
                    borderColor: category === r.value ? 'var(--sh-brand)' : 'var(--sh-border)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <label style={styles.label}>
              Additional details (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="Provide any additional context..."
                rows={3}
                style={styles.textarea}
              />
              <span style={styles.charCount}>{note.length}/500</span>
            </label>

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" style={styles.primaryBtn} disabled={submitting || !category}>
                {submitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(4px)',
    zIndex: 550,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT,
  },
  modal: {
    background: 'var(--sh-surface)',
    borderRadius: 18,
    border: '1px solid var(--sh-border)',
    padding: 'clamp(20px, 3vw, 28px)',
    width: 'min(460px, 92vw)',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    lineHeight: 1.3,
  },
  message: {
    margin: '8px 0 16px',
    fontSize: 13,
    color: 'var(--sh-subtext)',
    lineHeight: 1.55,
  },
  reasonGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reasonChip: {
    padding: '7px 14px',
    borderRadius: 20,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all .15s',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--sh-muted)',
    marginBottom: 16,
  },
  textarea: {
    display: 'block',
    width: '100%',
    marginTop: 6,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
    fontSize: 13,
    fontFamily: FONT,
    resize: 'vertical',
    minHeight: 60,
    boxSizing: 'border-box',
  },
  charCount: {
    display: 'block',
    textAlign: 'right',
    fontSize: 11,
    color: 'var(--sh-muted)',
    marginTop: 4,
  },
  error: {
    margin: '0 0 12px',
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--sh-danger-bg)',
    border: '1px solid var(--sh-danger-border)',
    color: 'var(--sh-danger-text)',
    fontSize: 12,
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    padding: '9px 18px',
    borderRadius: 10,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-muted)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'background 0.12s',
  },
  primaryBtn: {
    padding: '9px 18px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--sh-brand)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'opacity 0.12s',
  },
}
