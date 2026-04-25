/* ═══════════════════════════════════════════════════════════════════════════
 * LoginChallengePage.jsx — email step-up after a high-risk sign-in attempt.
 *
 * Route: /login/challenge/:id
 *
 * The backend classified the current sign-in as high-risk (score >= 60) and
 * emailed a 6-digit code. The user lands here and enters it to complete
 * the sign-in. Wrong code: up to 3 attempts, then the challenge locks.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { fadeInUp } from '../../lib/animations'
import './LoginPage.css'

const CODE_LENGTH = 6

export default function LoginChallengePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()
  const cardRef = useRef(null)
  const inputRef = useRef(null)

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (cardRef.current) fadeInUp(cardRef.current, { duration: 350 })
    if (inputRef.current) inputRef.current.focus()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code.`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/login/challenge`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: id, code }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.reason === 'locked' || data.reason === 'expired' || data.reason === 'consumed') {
          setLocked(true)
        }
        setError(data.error || 'Could not verify code.')
        setCode('')
        return
      }

      completeAuthentication(data.user)
      navigate(getAuthenticatedHomePath(data.user), { replace: true })
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)' }}>
      <Navbar hideTabs />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div
          ref={cardRef}
          className="login-card"
          style={{
            maxWidth: 420,
            width: '100%',
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 16,
            padding: '36px 32px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 24, color: 'var(--sh-heading)' }}>
            Confirm it's you
          </h1>
          <p
            style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--sh-muted)', lineHeight: 1.6 }}
          >
            We flagged this sign-in as unusual and emailed you a {CODE_LENGTH}-digit code. Enter it
            here to continue. The code expires in 15 minutes.
          </p>

          {error && (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--sh-danger-border)',
                background: 'var(--sh-danger-bg)',
                color: 'var(--sh-danger-text)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          {locked ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
                This challenge can no longer be used. Please sign in again to request a new code.
              </p>
              <Link
                to="/login"
                style={{
                  display: 'inline-block',
                  marginTop: 14,
                  padding: '10px 18px',
                  borderRadius: 10,
                  background: 'var(--sh-brand)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <label
                htmlFor="challenge-code"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sh-subtext)',
                  marginBottom: 8,
                }}
              >
                Your code
              </label>
              <input
                id="challenge-code"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: 22,
                  letterSpacing: 8,
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  border: '1px solid var(--sh-input-border)',
                  borderRadius: 10,
                  color: 'var(--sh-input-text)',
                  background: 'var(--sh-input-bg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 16,
                }}
              />
              <button
                type="submit"
                disabled={loading || code.length !== CODE_LENGTH}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--sh-brand)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Verifying...' : 'Verify and sign in'}
              </button>
              <p
                style={{
                  margin: '16px 0 0',
                  fontSize: 12,
                  color: 'var(--sh-muted)',
                  textAlign: 'center',
                }}
              >
                Didn't get the code? Check your spam folder or{' '}
                <Link to="/login" style={{ color: 'var(--sh-brand)', fontWeight: 600 }}>
                  sign in again
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
