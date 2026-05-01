/**
 * Setup2FAPage — landing page for the admin-MFA-required gate.
 *
 * Reached when the login API returns 403 with code `MFA_SETUP_REQUIRED`
 * (see `auth.login.controller.js`). The user is an admin whose
 * `mfaRequired = true` but `twoFaEnabled = false`, and the
 * `flag_admin_mfa_required` flag is on.
 *
 * Self-serve toggle for `twoFaEnabled` doesn't exist yet — the column
 * is set by the trusted-device challenge flow. Until that endpoint
 * lands, this page surfaces the current 2FA state, explains the gate,
 * and points the user at the recovery-codes section once 2FA is on.
 *
 * NOT a route any non-admin needs. The path is
 * `/settings/security/setup-2fa` so a deep-link from the login error
 * lands here.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { Button, Message, SectionCard } from './settingsShared'

export default function Setup2FAPage() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [loaded, setLoaded] = useState(false)
  // Reserved for surfacing future enable-2FA endpoint errors. The
  // current page is read-only (status + instructions) so no error
  // setter is wired; the consumer is the JSX guard below.
  const error = ''

  useEffect(() => {
    fetch(`${API}/api/users/me`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('not-authed')
        return res.json()
      })
      .then((data) => {
        setMe(data.user || data)
        setLoaded(true)
      })
      .catch(() => {
        setLoaded(true)
        navigate('/login', { replace: true })
      })
  }, [navigate])

  if (!loaded) {
    return (
      <main style={pageStyle}>
        <p style={{ color: 'var(--sh-muted)' }}>Loading…</p>
      </main>
    )
  }
  if (!me) return null

  const twoFaOn = Boolean(me.twoFaEnabled)
  const isAdmin = me.role === 'admin'

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>Set up two-factor authentication</h1>

      {!isAdmin && (
        <Message tone="info">
          Two-factor authentication is optional for student accounts. You can still set it up below
          if you want to.
        </Message>
      )}

      {isAdmin && !twoFaOn && (
        <Message tone="warning">
          Admin accounts must have 2FA enabled. Until you complete setup, you cannot access the
          admin dashboard.
        </Message>
      )}

      {error ? <Message tone="error">{error}</Message> : null}

      <SectionCard
        title="Email-based 2FA"
        subtitle="StudyHub sends a 6-digit code to your verified email when you sign in from a new device."
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={statusStyle}>
            <span
              style={{
                ...badgeBaseStyle,
                background: twoFaOn ? 'var(--sh-success-bg)' : 'var(--sh-warning-bg)',
                borderColor: twoFaOn ? 'var(--sh-success-border)' : 'var(--sh-warning-border)',
                color: twoFaOn ? 'var(--sh-success-text)' : 'var(--sh-warning-text)',
              }}
            >
              {twoFaOn ? 'Email 2FA is ON' : 'Email 2FA is OFF'}
            </span>
            {!me.emailVerified && (
              <span
                style={{
                  ...badgeBaseStyle,
                  background: 'var(--sh-danger-bg)',
                  borderColor: 'var(--sh-danger-border)',
                  color: 'var(--sh-danger-text)',
                }}
              >
                Email not verified
              </span>
            )}
          </div>

          {!twoFaOn && (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
              {!me.emailVerified && (
                <li>
                  <strong>Verify your email first.</strong> Open Settings → Email and click "Resend
                  verification email", then click the link in your inbox.
                </li>
              )}
              <li>
                <strong>Sign out and sign back in</strong> from a clean browser session (or a new
                device). StudyHub will send a 6-digit step-up code to your verified email — entering
                it once turns on email 2FA for your account.
              </li>
              <li>
                Once 2FA is on, head back to{' '}
                <Link to="/settings?tab=security" style={linkStyle}>
                  Settings → Security
                </Link>{' '}
                to generate single-use recovery codes (in case you lose access to your email).
              </li>
            </ol>
          )}

          {twoFaOn && (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
              You're protected by email 2FA. Generate{' '}
              <Link to="/settings?tab=security" style={linkStyle}>
                recovery codes
              </Link>{' '}
              now so you can still sign in if you lose access to your email.
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={() => navigate('/settings?tab=security')}>
              Go to Settings → Security
            </Button>
            <Button secondary onClick={() => navigate('/feed')}>
              Back to feed
            </Button>
          </div>
        </div>
      </SectionCard>

      <p style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 24 }}>
        Industry-standard two-factor authentication (NIST 800-63B AAL2). StudyHub does not store
        your 2FA codes; codes are sent to your verified email address only and expire after 15
        minutes.
      </p>
    </main>
  )
}

const pageStyle = {
  maxWidth: 720,
  margin: '40px auto',
  padding: '0 20px',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: 'var(--sh-text)',
}
const titleStyle = {
  margin: '0 0 24px',
  fontSize: 28,
  fontWeight: 800,
  color: 'var(--sh-heading)',
}
const statusStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}
const badgeBaseStyle = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid',
  fontSize: 12,
  fontWeight: 700,
}
const linkStyle = {
  color: 'var(--sh-brand)',
  textDecoration: 'none',
  fontWeight: 600,
}
