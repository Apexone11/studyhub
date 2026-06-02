/**
 * MfaStepUpModal.jsx — step-up MFA prompt.
 *
 * Two flows, gated on the `setupRequired` prop:
 *
 *   setupRequired=true  → "You need to set up 2FA first" panel with
 *     a single "Go to Settings" CTA + Cancel.
 *
 *   setupRequired=false → Two-step OTP flow:
 *     1. Auto-POSTs /api/auth/mfa/step-up/start on mount, captures
 *        challengeId, surfaces "Code sent to your email." status.
 *     2. User types 6-digit code, hits Verify, POSTs
 *        /api/auth/mfa/step-up/verify. On 200, calls onSuccess().
 *     2b. Optional "Use recovery code" tab — POSTs verify with a
 *         recoveryCode body instead. Honours flag_2fa_recovery_codes
 *         (404 from the endpoint when off).
 *
 * Reuses the shared <FocusTrappedDialog> primitive so Tab cycling +
 * Escape + focus restoration all work per the W3C ARIA Authoring
 * Practices §3.9 modal pattern.
 *
 * Pairs with backend/src/modules/auth/mfa.stepUp.controller.js.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../config'
import FocusTrappedDialog from './Modal/FocusTrappedDialog'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

async function postJson(url, body) {
  const response = await fetch(`${API}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

export default function MfaStepUpModal({ setupRequired, reason, onSuccess, onCancel }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('otp') // 'otp' | 'recovery'
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [busy, setBusy] = useState(false)
  // Track mount so we don't double-fire the start request in StrictMode.
  const startedRef = useRef(false)

  useEffect(() => {
    if (setupRequired) return undefined
    if (startedRef.current) return undefined
    startedRef.current = true

    let cancelled = false
    ;(async () => {
      setBusy(true)
      setStatusMsg('Sending verification code...')
      const { ok, status, data } = await postJson('/api/auth/mfa/step-up/start')
      if (cancelled) return
      setBusy(false)
      if (ok) {
        setChallengeId(data.challengeId)
        setStatusMsg('Code sent to your email.')
      } else if (status === 409) {
        // Setup required — backend told us 2FA isn't configured. Switch
        // to the setup-required view so the user has a clear next step.
        setErrorMsg(data?.error || 'Enable email 2FA in Settings before continuing.')
        setStatusMsg('')
      } else {
        setErrorMsg(data?.error || 'Could not send verification code.')
        setStatusMsg('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setupRequired])

  async function handleVerify(event) {
    event.preventDefault()
    if (busy) return
    setErrorMsg('')
    setBusy(true)
    const body =
      mode === 'recovery'
        ? { recoveryCode: recoveryCode.trim() }
        : { challengeId, code: code.trim() }
    const { ok, status, data } = await postJson('/api/auth/mfa/step-up/verify', body)
    setBusy(false)
    if (ok) {
      onSuccess()
      return
    }
    if (status === 404 && mode === 'recovery') {
      setErrorMsg('Recovery codes are not enabled on this account.')
      return
    }
    setErrorMsg(data?.error || 'Verification failed. Try again.')
  }

  return (
    <FocusTrappedDialog
      open
      onClose={onCancel}
      role="alertdialog"
      ariaLabelledBy="mfa-stepup-title"
      // Setup-required mode and the verify form both carry user input —
      // backdrop click would discard whatever code they're typing.
      clickOutsideDeactivates={false}
      initialFocusSelector={setupRequired ? '[data-mfa-setup-go]' : '[data-mfa-code-input]'}
      mobileLayout="centered"
      panelStyle={{
        background: 'var(--sh-surface)',
        borderRadius: 16,
        padding: 24,
        width: 'min(440px, 92vw)',
        maxWidth: 'min(440px, 92vw)',
        boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
        fontFamily: FONT,
        display: 'grid',
        gap: 14,
      }}
    >
      <h3
        id="mfa-stepup-title"
        style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}
      >
        {setupRequired ? 'Set up 2FA to continue' : 'Confirm your identity'}
      </h3>

      {setupRequired ? (
        <>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--sh-subtext)' }}>
            This action requires step-up authentication. Enable email 2FA in Settings, then return
            here and try again.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onCancel} style={cancelBtnStyle}>
              Cancel
            </button>
            <button
              data-mfa-setup-go
              type="button"
              onClick={() => {
                navigate('/settings/security/setup-2fa')
                onCancel()
              }}
              style={primaryBtnStyle}
            >
              Go to Settings
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleVerify}>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--sh-subtext)',
            }}
          >
            {reason === 'stale'
              ? 'Your last verification was more than 15 minutes ago. Re-verify to continue.'
              : 'For security, confirm a code sent to your email before continuing.'}
          </p>

          {statusMsg ? (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--sh-muted)' }}>
              {statusMsg}
            </p>
          ) : null}

          {mode === 'otp' ? (
            <label style={labelStyle}>
              6-digit code
              <input
                data-mfa-code-input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                style={inputStyle}
              />
            </label>
          ) : (
            <label style={labelStyle}>
              Recovery code
              <input
                type="text"
                autoComplete="off"
                spellCheck="false"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="xxxxx-xxxxx"
                style={inputStyle}
              />
            </label>
          )}

          {errorMsg ? (
            <p
              style={{
                margin: '8px 0 0',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                color: 'var(--sh-danger-text)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {errorMsg}
            </p>
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === 'otp' ? 'recovery' : 'otp'))
                setErrorMsg('')
              }}
              style={linkBtnStyle}
            >
              {mode === 'otp' ? 'Use recovery code instead' : 'Use email code instead'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onCancel} style={cancelBtnStyle} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                style={primaryBtnStyle}
                disabled={
                  busy ||
                  (mode === 'otp' ? code.length !== 6 || !challengeId : recoveryCode.length < 10)
                }
              >
                {busy ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        </form>
      )}
    </FocusTrappedDialog>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--sh-muted)',
  fontFamily: FONT,
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-bg)',
  color: 'var(--sh-text)',
  fontSize: 16,
  fontFamily: FONT,
  letterSpacing: '0.06em',
  boxSizing: 'border-box',
}

const primaryBtnStyle = {
  padding: '9px 18px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--sh-brand)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
}

const cancelBtnStyle = {
  padding: '9px 18px',
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-muted)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONT,
}

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--sh-brand)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
  fontFamily: FONT,
}
