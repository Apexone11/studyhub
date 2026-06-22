/* ═══════════════════════════════════════════════════════════════════════════
 * UnsubscribePage.jsx — Public one-click unsubscribe at /unsubscribe
 *
 * Public-safe (no auth). Two entry shapes from the email footer link:
 *   - ?status=ok                → backend already processed it; show success.
 *   - ?token=<token>            → show a confirm button that POSTs the token to
 *                                 /api/newsletter/unsubscribe, then success.
 * Invalid/expired tokens (400) surface a graceful error. No auth required, so
 * the page renders for logged-out recipients clicking from their inbox.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { IconCheck } from '../../components/Icons'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { usePageTitle } from '../../lib/usePageTitle'
import { PAGE_FONT } from './newsletterConstants'

export default function UnsubscribePage() {
  usePageTitle('Unsubscribe')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const statusParam = searchParams.get('status') || ''

  // `done` is true once we (or the backend, via ?status=ok) have confirmed.
  const [done, setDone] = useState(statusParam === 'ok')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleUnsubscribe() {
    if (!token) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/newsletter/unsubscribe`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        if (res.status === 400) {
          setError('This unsubscribe link is invalid or has expired.')
        } else {
          setError('We could not process your request. Please try again.')
        }
        return
      }
      setDone(true)
    } catch {
      setError('We could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Navbar />
      <main id="main-content" style={styles.page}>
        <div style={styles.inner}>
          <div className="sh-card" style={styles.card}>
            {done ? (
              <>
                <div style={styles.successIcon} aria-hidden="true">
                  <IconCheck size={26} />
                </div>
                <h1 style={styles.title}>You&rsquo;ve been unsubscribed</h1>
                <p style={styles.body}>
                  You will no longer receive product update emails. You can re-enable &ldquo;Product
                  updates &amp; announcements&rdquo; any time in{' '}
                  <Link to="/settings" style={styles.link}>
                    Settings
                  </Link>
                  .
                </p>
                <Link to="/updates" style={styles.secondaryLink}>
                  See What&rsquo;s New
                </Link>
              </>
            ) : !token ? (
              <>
                <h1 style={styles.title}>Unsubscribe link missing</h1>
                <p style={styles.body}>
                  This page needs a valid unsubscribe link from one of our emails. If you are signed
                  in, you can manage all email preferences in{' '}
                  <Link to="/settings" style={styles.link}>
                    Settings
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <h1 style={styles.title}>Unsubscribe from product updates</h1>
                <p style={styles.body}>
                  Confirm below to stop receiving product update and announcement emails from
                  StudyHub.
                </p>
                {error ? (
                  <div role="alert" style={styles.error}>
                    {error}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={submitting}
                  style={{ ...styles.primaryButton, opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Unsubscribing...' : 'Unsubscribe'}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────────── */

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
    fontFamily: PAGE_FONT,
  },
  inner: {
    maxWidth: 520,
    margin: '0 auto',
    padding: '48px 24px 72px',
  },
  card: {
    padding: '32px 28px',
    textAlign: 'center',
    display: 'grid',
    gap: 12,
    justifyItems: 'center',
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'var(--sh-success-bg)',
    color: 'var(--sh-success-text)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--sh-heading)',
  },
  body: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--sh-muted)',
    maxWidth: 400,
  },
  link: {
    color: 'var(--sh-brand)',
    textDecoration: 'none',
    fontWeight: 700,
  },
  primaryButton: {
    marginTop: 6,
    padding: '11px 22px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
  },
  secondaryLink: {
    marginTop: 4,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 18px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-heading)',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    border: '1px solid var(--sh-border)',
  },
  error: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--sh-danger-bg)',
    border: '1px solid var(--sh-danger-border)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--sh-danger-text)',
  },
}
