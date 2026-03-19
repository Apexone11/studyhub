/**
 * EmailVerificationBanner — Persistent soft-gate banner for unverified users.
 *
 * Shows a dismissible (per-session) banner prompting email verification.
 * Renders nothing if the user is verified or unauthenticated.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session-context'

export default function EmailVerificationBanner() {
  const { user } = useSession()
  const [dismissed, setDismissed] = useState(false)

  if (!user || user.emailVerified || dismissed) return null

  return (
    <div
      role="alert"
      style={{
        background: 'var(--sh-warning-bg, #fffbeb)',
        border: '1px solid var(--sh-warning-border, #fde68a)',
        color: 'var(--sh-warning-text, #92400e)',
        padding: '10px 16px',
        fontSize: 13,
        lineHeight: 1.6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <span>
        Please verify your email to upload sheets, post comments, and access all features.
      </span>
      <Link
        to="/settings"
        style={{
          color: 'var(--sh-link, #2563eb)',
          fontWeight: 700,
          fontSize: 13,
          textDecoration: 'underline',
        }}
      >
        Verify now
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss verification banner"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--sh-warning-text, #92400e)',
          fontSize: 16,
          cursor: 'pointer',
          padding: '0 4px',
          opacity: 0.6,
        }}
      >
        ×
      </button>
    </div>
  )
}
