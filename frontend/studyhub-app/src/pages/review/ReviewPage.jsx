/* ═══════════════════════════════════════════════════════════════════════════
 * ReviewPage.jsx — Leave / edit a review for StudyHub
 * Route: /review (authenticated)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import { usePageTitle } from '../../lib/usePageTitle'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const MAX_CHARS = 500

function StarIcon({ filled, size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'var(--sh-warning)' : 'none'}
      stroke={filled ? 'var(--sh-warning)' : 'var(--sh-border)'}
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: {
      bg: 'var(--sh-warning-bg)',
      color: 'var(--sh-warning-text)',
      border: 'var(--sh-warning-border)',
      label: 'Pending',
    },
    approved: {
      bg: 'var(--sh-success-bg)',
      color: 'var(--sh-success-text)',
      border: 'var(--sh-success-border)',
      label: 'Approved',
    },
    rejected: {
      bg: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger-text)',
      border: 'var(--sh-danger-border)',
      label: 'Rejected',
    },
  }
  const s = map[status] || map.pending
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  )
}

export default function ReviewPage() {
  const layout = useResponsiveAppLayout()
  const { user } = useSession()
  usePageTitle('Leave a Review')

  const [stars, setStars] = useState(0)
  const [hoverStar, setHoverStar] = useState(0)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [existingReview, setExistingReview] = useState(null)
  const [loadingExisting, setLoadingExisting] = useState(true)

  /* ── Load existing review ──────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return
    fetch(`${API}/api/reviews/mine`, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 404) return null
        if (!r.ok) throw new Error('Could not load your review')
        return r.json()
      })
      .then((data) => {
        if (data) {
          setExistingReview(data)
          setStars(data.stars || 0)
          setText(data.text || '')
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false))
  }, [user])

  /* ── Submit / Update ───────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault()
    if (!stars || !text.trim()) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Always POST -- backend upserts by userId
      const res = await fetch(`${API}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stars, text: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setExistingReview(data)
      setSuccess(
        existingReview
          ? 'Your review has been updated. It will appear on our homepage after approval.'
          : 'Thank you for your review! It will appear on our homepage after approval.',
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const navActions = (
    <Link
      to="/feed"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid var(--sh-border)',
        color: 'var(--sh-slate-400)',
        textDecoration: 'none',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      Back to Feed
    </Link>
  )

  const displayStars = hoverStar || stars

  return (
    <div
      className="sh-app-page"
      style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}
    >
      <Navbar crumbs={[{ label: 'Leave a Review', to: '/review' }]} hideTabs actions={navActions} />
      <div
        className="app-two-col-grid sh-ambient-grid sh-ambient-shell"
        style={{
          ...pageShell('app'),
          gap: 20,
        }}
      >
        <AppSidebar mode={layout.sidebarMode} />

        <main
          className="sh-ambient-main"
          id="main-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            paddingTop: 8,
          }}
        >
          <div
            style={{
              background: 'var(--sh-surface)',
              borderRadius: 16,
              border: '1px solid var(--sh-border)',
              padding: 'clamp(24px, 4vw, 40px)',
              maxWidth: 600,
              width: '100%',
              boxShadow: 'var(--shadow-sm, 0 2px 10px rgba(15,23,42,0.05))',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1
                style={{
                  margin: '0 0 8px',
                  fontSize: 22,
                  fontWeight: 800,
                  color: 'var(--sh-heading)',
                }}
              >
                Share Your Experience
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--sh-muted)' }}>
                Help other students discover StudyHub
              </p>
              {existingReview && (
                <div style={{ marginTop: 12 }}>
                  <StatusBadge status={existingReview.status} />
                </div>
              )}
            </div>

            {loadingExisting ? (
              <div
                style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)', fontSize: 13 }}
              >
                Loading...
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {/* Star Rating */}
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--sh-heading)',
                      marginBottom: 10,
                    }}
                  >
                    Rating
                  </label>
                  <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHoverStar(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setStars(n)}
                        onMouseEnter={() => setHoverStar(n)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 2,
                          transition: 'transform 0.15s',
                          transform:
                            hoverStar >= n || (!hoverStar && stars >= n)
                              ? 'scale(1.15)'
                              : 'scale(1)',
                        }}
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      >
                        <StarIcon filled={displayStars >= n} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review Text */}
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--sh-heading)',
                      marginBottom: 8,
                    }}
                  >
                    Your Review
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                    placeholder="What do you love about StudyHub?"
                    rows={5}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--sh-input-border)',
                      background: 'var(--sh-input-bg)',
                      color: 'var(--sh-input-text)',
                      fontSize: 14,
                      fontFamily: FONT,
                      resize: 'vertical',
                      lineHeight: 1.6,
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--sh-brand)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--sh-input-border)'
                    }}
                  />
                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: 12,
                      marginTop: 4,
                      color:
                        text.length > MAX_CHARS - 50 ? 'var(--sh-warning-text)' : 'var(--sh-muted)',
                    }}
                  >
                    {text.length}/{MAX_CHARS}
                  </div>
                </div>

                {/* Messages */}
                {success && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      marginBottom: 16,
                      background: 'var(--sh-success-bg)',
                      border: '1px solid var(--sh-success-border)',
                      color: 'var(--sh-success-text)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {success}
                  </div>
                )}
                {error && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      marginBottom: 16,
                      background: 'var(--sh-danger-bg)',
                      border: '1px solid var(--sh-danger-border)',
                      color: 'var(--sh-danger-text)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!stars || !text.trim() || saving}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: 12,
                    border: 'none',
                    background: !stars || !text.trim() ? 'var(--sh-slate-300)' : 'var(--sh-brand)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: !stars || !text.trim() || saving ? 'not-allowed' : 'pointer',
                    fontFamily: FONT,
                    transition: 'background 0.15s, opacity 0.15s',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Submitting...' : existingReview ? 'Update Review' : 'Submit Review'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
