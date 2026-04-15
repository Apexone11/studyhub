import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'
import { useSession } from '../../lib/session-context'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/roleLabel'

const STORAGE_KEY = 'studyhub.google.pending'

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

export default function RolePickerPage() {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()
  const [pending] = useState(() => readPending())
  const [accountType, setAccountType] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

  async function handleSubmit() {
    if (!accountType) {
      setError('Pick a role to continue.')
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
          className="sh-button"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !accountType}
          className="sh-button sh-button--primary"
        >
          {submitting ? 'Finishing…' : 'Continue'}
        </button>
      </div>
    </main>
  )
}
