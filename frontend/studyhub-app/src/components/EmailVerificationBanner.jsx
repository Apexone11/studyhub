/**
 * EmailVerificationBanner — Persistent soft-gate banner for unverified users.
 *
 * Shows a dismissible (per-session) banner prompting email verification.
 * Renders nothing if the user is verified or unauthenticated.
 *
 * EmailVerificationInline — Inline error block shown when an API call
 * returns EMAIL_NOT_VERIFIED. Use inside forms/editors after a blocked action.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session-context'

/**
 * Inline error block for use inside forms when a 403 EMAIL_NOT_VERIFIED is returned.
 * Pass visible={true} after detecting the error code.
 */
export function EmailVerificationInline({ visible }) {
  if (!visible) return null

  return (
    <div
      role="alert"
      style={{
        background: 'var(--sh-warning-bg, #fffbeb)',
        border: '1px solid var(--sh-warning-border, #fde68a)',
        color: 'var(--sh-warning-text, #92400e)',
        padding: '14px 18px',
        borderRadius: 12,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <strong>Email verification required.</strong>{' '}
      Verify your email to upload sheets, post comments, and access all features.{' '}
      <Link to="/settings?tab=account" style={{ color: 'var(--sh-link, #2563eb)', fontWeight: 700, textDecoration: 'underline' }}>
        Verify now
      </Link>
    </div>
  )
}

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
        to="/settings?tab=account"
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
        &times;
      </button>
    </div>
  )
}
