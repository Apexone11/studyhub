/**
 * ReviewTab — Settings tab for submitting / editing a product review.
 *
 * Uses:
 *   GET  /api/reviews/mine   — load existing review
 *   POST /api/reviews        — submit or update
 *
 * One review per user (unique constraint). If they already submitted,
 * show the existing review with an Edit button (pending only).
 * Approved reviews are read-only with an "Approved" badge.
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'

const MAX_TEXT = 500

export default function ReviewTab() {
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stars, setStars] = useState(0)
  const [hoverStars, setHoverStars] = useState(0)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)

  const loadReview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/reviews/mine`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (res.status === 404) {
        setReview(null)
        return
      }
      const data = await readJsonSafely(res, {})
      if (res.ok && data.review) {
        setReview(data.review)
        setStars(data.review.stars || 0)
        setText(data.review.text || '')
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadReview() }, [loadReview])

  async function handleSubmit(event) {
    event.preventDefault()
    if (stars < 1 || stars > 5 || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/reviews`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ stars, text: text.trim() }),
      })
      const data = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Could not submit review.'))
      showToast('Thank you! Your review is pending approval.', 'success')
      setEditing(false)
      void loadReview()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
  }

  // Existing review — read-only if approved, editable if pending
  if (review && !editing) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sh-heading)' }}>
          Your review
        </h3>

        <div style={{
          padding: '16px 18px', borderRadius: 14,
          background: 'var(--sh-soft)', border: '1px solid var(--sh-border)',
          display: 'grid', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StarDisplay count={review.stars} />
            <span style={statusBadge(review.status)}>{review.status}</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--sh-heading)' }}>
            {review.text || <em style={{ color: 'var(--sh-muted)' }}>No written feedback.</em>}
          </p>
          <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
            Submitted {new Date(review.createdAt).toLocaleDateString()}
          </div>
          {review.status === 'pending' ? (
            <button
              onClick={() => setEditing(true)}
              style={editBtnStyle}
            >
              Edit review
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  // Submit / edit form
  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sh-heading)' }}>
        {review ? 'Edit your review' : 'Leave a review'}
      </h3>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--sh-muted)' }}>
        Tell us what you think about StudyHub. Your review will be visible
        after approval.
      </p>

      {/* Star picker */}
      <div>
        <label style={labelStyle}>Rating *</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              onMouseEnter={() => setHoverStars(n)}
              onMouseLeave={() => setHoverStars(0)}
              aria-label={`${n} star${n !== 1 ? 's' : ''}`}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 28, lineHeight: 1, padding: 0,
                color: (hoverStars || stars) >= n ? 'var(--sh-warning, #f59e0b)' : 'var(--sh-border)',
                transition: 'color 0.15s, transform 0.15s',
                transform: (hoverStars || stars) >= n ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
              </svg>
            </button>
          ))}
        </div>
        {stars === 0 ? <div style={{ fontSize: 11, color: 'var(--sh-danger)', marginTop: 4 }}>Please select a rating.</div> : null}
      </div>

      {/* Text area */}
      <div>
        <label style={labelStyle}>
          Your feedback ({MAX_TEXT - text.length} chars left)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          placeholder="Tell us what you think about StudyHub..."
          maxLength={MAX_TEXT}
          rows={4}
          style={textareaStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          disabled={stars < 1 || submitting}
          style={{
            ...submitBtnStyle,
            opacity: (stars < 1 || submitting) ? 0.5 : 1,
            cursor: (stars < 1 || submitting) ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Submitting...' : review ? 'Update review' : 'Submit review'}
        </button>
        {editing ? (
          <button type="button" onClick={() => setEditing(false)} style={cancelBtnStyle}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}

function StarDisplay({ count }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={n <= count ? 'var(--sh-warning, #f59e0b)' : 'var(--sh-border)'}
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      ))}
    </div>
  )
}

function statusBadge(status) {
  const map = {
    pending: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)' },
    approved: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' },
    rejected: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)' },
  }
  const s = map[status] || map.pending
  return {
    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', background: s.bg, color: s.color,
  }
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--sh-muted)',
  textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4,
}

const textareaStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 10, border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)', color: 'var(--sh-heading)',
  fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 80,
}

const submitBtnStyle = {
  padding: '10px 18px', borderRadius: 10, border: 'none',
  background: 'var(--sh-brand)', color: 'var(--sh-btn-primary-text, #fff)',
  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
}

const cancelBtnStyle = {
  padding: '10px 18px', borderRadius: 10,
  border: '1px solid var(--sh-border)', background: 'var(--sh-surface)',
  color: 'var(--sh-heading)', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const editBtnStyle = {
  padding: '8px 14px', borderRadius: 8,
  border: '1px solid var(--sh-brand)', background: 'transparent',
  color: 'var(--sh-brand)', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', justifySelf: 'start',
}
