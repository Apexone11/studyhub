import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'
import { useSession } from '../../lib/session-context'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/roleLabel'

const STORAGE_KEY = 'studyhub.google.pending'
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

function readPending() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function deriveDefaultUsername(email, name) {
  const fromEmail = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 20)
  if (fromEmail.length >= 3) return fromEmail
  const fromName = String(name || '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 20)
  if (fromName.length >= 3) return fromName
  return ''
}

export default function RolePickerPage() {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()
  const [pending] = useState(() => readPending())
  const [accountType, setAccountType] = useState('')
  const [legalAck, setLegalAck] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [username, setUsername] = useState(() =>
    pending ? deriveDefaultUsername(pending.email, pending.name) : '',
  )
  const [usernameStatus, setUsernameStatus] = useState({ checking: false, kind: null, message: '' })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [setPasswordNow, setSetPasswordNow] = useState(true)

  const profile = useMemo(
    () =>
      pending ? { email: pending.email, name: pending.name, avatarUrl: pending.avatarUrl } : null,
    [pending],
  )

  useEffect(() => {
    if (!pending) {
      navigate('/signup', { replace: true })
    }
  }, [pending, navigate])

  // Live username availability check (debounced). Hits the public
  // /api/auth/check-username endpoint; results never leak data we don't
  // already expose at /users/<u>.
  useEffect(() => {
    if (!username) {
      setUsernameStatus({ checking: false, kind: null, message: '' })
      return
    }
    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus({
        checking: false,
        kind: 'error',
        message: '3-20 chars: letters, numbers, or underscore.',
      })
      return
    }
    setUsernameStatus({ checking: true, kind: null, message: 'Checking…' })
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`${API}/api/auth/check-username?username=${encodeURIComponent(username)}`, {
        signal: controller.signal,
        credentials: 'include',
      })
        .then((r) => r.json())
        .then((data) => {
          if (controller.signal.aborted) return
          if (data.available) {
            setUsernameStatus({ checking: false, kind: 'success', message: 'Available.' })
          } else {
            const msg =
              data.reason === 'reserved'
                ? 'That username is reserved. Pick another.'
                : data.reason === 'invalid'
                  ? '3-20 chars: letters, numbers, or underscore.'
                  : 'Already taken.'
            setUsernameStatus({ checking: false, kind: 'error', message: msg })
          }
        })
        .catch(() => {
          // Fail-open: don't block submit on a network blip; backend
          // will surface a 409 if it really collides.
          if (!controller.signal.aborted) {
            setUsernameStatus({ checking: false, kind: null, message: '' })
          }
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [username])

  const passwordOk = setPasswordNow
    ? password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
    : true
  const passwordsMatch = setPasswordNow ? password === confirmPassword : true
  const usernameOk = USERNAME_REGEX.test(username) && usernameStatus.kind !== 'error'

  async function handleSubmit() {
    if (!accountType) {
      setError('Pick a role to continue.')
      return
    }
    if (!legalAck) {
      setError('Please review and accept the legal documents to continue.')
      return
    }
    if (!usernameOk) {
      setError('Pick a valid username.')
      return
    }
    if (setPasswordNow && !passwordOk) {
      setError('Password needs 8+ characters, one capital, and one number.')
      return
    }
    if (setPasswordNow && !passwordsMatch) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/google/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken: pending.tempToken,
          accountType,
          legalAccepted: true,
          legalVersion: CURRENT_LEGAL_VERSION,
          username,
          password: setPasswordNow ? password : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not complete signup. Start Google sign-in again.')
        return
      }
      clearPending()
      completeAuthentication(data.user)
      navigate(data.nextRoute || '/', { replace: true })
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!pending) return null

  const continueDisabled =
    submitting ||
    !accountType ||
    !legalAck ||
    !usernameOk ||
    (setPasswordNow && (!passwordOk || !passwordsMatch))

  return (
    <main
      style={{
        maxWidth: 480,
        margin: '56px auto',
        padding: '0 20px',
        display: 'grid',
        gap: 20,
      }}
    >
      <header style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>
          One more step
        </h1>
        <p style={{ margin: 0, color: 'var(--sh-subtext)', fontSize: 14 }}>
          Tell us how you plan to use StudyHub. You can change this later in Settings.
        </p>
        {profile?.email ? (
          <p style={{ margin: 0, color: 'var(--sh-muted)', fontSize: 13 }}>
            Continuing as <strong>{profile.email}</strong>
          </p>
        ) : null}
      </header>

      {/* Username */}
      <div style={{ display: 'grid', gap: 6 }}>
        <label
          htmlFor="rolepicker-username"
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}
        >
          Choose your username
        </label>
        <input
          id="rolepicker-username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value.trim())
            setError('')
          }}
          autoComplete="username"
          maxLength={20}
          style={inputStyle}
          placeholder="3-20 chars, letters/numbers/_"
        />
        {usernameStatus.message ? (
          <span
            style={{
              fontSize: 12,
              color:
                usernameStatus.kind === 'success'
                  ? 'var(--sh-success-text)'
                  : usernameStatus.kind === 'error'
                    ? 'var(--sh-danger-text)'
                    : 'var(--sh-muted)',
            }}
          >
            {usernameStatus.message}
          </span>
        ) : null}
      </div>

      {/* Optional password — keeps password-confirm gates working post-signup */}
      <div style={{ display: 'grid', gap: 8 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--sh-text)',
          }}
        >
          <input
            type="checkbox"
            checked={setPasswordNow}
            onChange={(e) => setSetPasswordNow(e.target.checked)}
          />
          Set a password (recommended — used when deleting your account or changing email)
        </label>
        {setPasswordNow ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Password (8+ chars, 1 capital, 1 number)"
              style={inputStyle}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Confirm password"
              style={inputStyle}
            />
            {password && !passwordOk ? (
              <span style={{ fontSize: 12, color: 'var(--sh-danger-text)' }}>
                Password needs 8+ chars, one capital, and one number.
              </span>
            ) : null}
            {password && confirmPassword && !passwordsMatch ? (
              <span style={{ fontSize: 12, color: 'var(--sh-danger-text)' }}>
                Passwords do not match.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          display: 'grid',
          gap: 10,
        }}
      >
        <legend
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 4 }}
        >
          I am a…
        </legend>
        {ACCOUNT_TYPE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              border: `1px solid ${
                accountType === opt.value ? 'var(--sh-brand)' : 'var(--sh-border)'
              }`,
              background: accountType === opt.value ? 'var(--sh-brand-soft)' : 'var(--sh-surface)',
              borderRadius: 12,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            <input
              type="radio"
              name="accountType"
              value={opt.value}
              checked={accountType === opt.value}
              onChange={() => {
                setAccountType(opt.value)
                setError('')
              }}
              style={{ accentColor: 'var(--sh-brand)' }}
            />
            <span style={{ fontWeight: 600, color: 'var(--sh-heading)' }}>{opt.label}</span>
          </label>
        ))}
      </fieldset>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 13,
          color: 'var(--sh-text)',
          lineHeight: 1.55,
        }}
      >
        <input
          type="checkbox"
          checked={legalAck}
          onChange={(e) => setLegalAck(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          I&rsquo;ve reviewed and agree to the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--sh-link)' }}
          >
            Terms of Use
          </a>
          ,{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--sh-link)' }}
          >
            Privacy Policy
          </a>
          , and{' '}
          <a
            href="/guidelines"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--sh-link)' }}
          >
            Community Guidelines
          </a>
          .
        </span>
      </label>

      {error ? (
        <div
          role="alert"
          style={{
            background: 'var(--sh-danger-bg)',
            color: 'var(--sh-danger-text)',
            border: '1px solid var(--sh-danger-border)',
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          type="button"
          onClick={() => {
            clearPending()
            navigate('/signup', { replace: true })
          }}
          disabled={submitting}
          style={secondaryButtonStyle}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={continueDisabled}
          style={{
            ...primaryButtonStyle,
            opacity: continueDisabled ? 0.55 : 1,
            cursor: continueDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Finishing…' : 'Continue'}
        </button>
      </div>
    </main>
  )
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid var(--sh-input-border)',
  background: 'var(--sh-input-bg, var(--sh-surface))',
  color: 'var(--sh-input-text, var(--sh-text))',
  fontSize: 14,
  fontFamily: 'inherit',
}

const primaryButtonStyle = {
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--sh-brand)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  padding: '10px 20px',
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'transparent',
  color: 'var(--sh-text)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
