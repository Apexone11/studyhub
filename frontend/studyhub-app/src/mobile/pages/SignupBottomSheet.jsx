// src/mobile/pages/SignupBottomSheet.jsx
// Two-step mobile signup: Account fields -> Verify email code.
// Delegates to the same backend endpoints as the web RegisterScreen.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from '../components/BottomSheet'
import MobileGoogleButton from '../components/MobileGoogleButton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onSwitchToSignin
 */
export default function SignupBottomSheet({ open, onClose, onSwitchToSignin }) {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()

  const [step, setStep] = useState('account') // 'account' | 'verify'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('account')
      setError('')
      setLoading(false)
      setForm({ username: '', email: '', password: '', confirmPassword: '' })
      setVerificationCode('')
      setVerificationToken('')
    }
  }, [open])

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
  }, [])

  // ── Step 1: Create account ─────────────────────────────────────
  const handleCreateAccount = useCallback(
    async (e) => {
      e.preventDefault()

      if (!form.username.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
        setError('Please fill in all fields.')
        return
      }
      if (!USERNAME_RE.test(form.username.trim())) {
        setError('Username must be 3-20 characters: letters, numbers, or underscores.')
        return
      }
      if (!EMAIL_RE.test(form.email.trim())) {
        setError('Please enter a valid email address.')
        return
      }
      if (!PASSWORD_RE.test(form.password)) {
        setError('Password needs 8+ characters, a capital letter, and a number.')
        return
      }
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match.')
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(`${API}/api/auth/register/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            username: form.username.trim(),
            email: form.email.trim(),
            password: form.password,
            confirmPassword: form.confirmPassword,
            accountType: 'student',
            termsAccepted: true,
            termsVersion: CURRENT_LEGAL_VERSION,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Registration failed. Please try again.')
          return
        }

        setVerificationToken(data.verificationToken || '')
        setStep('verify')
      } catch {
        setError('Connection error. Please check your network.')
      } finally {
        setLoading(false)
      }
    },
    [form],
  )

  // ── Step 2: Verify email code ──────────────────────────────────
  const handleVerify = useCallback(
    async (e) => {
      e.preventDefault()
      if (!verificationCode.trim()) {
        setError('Enter the code sent to your email.')
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(`${API}/api/auth/register/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            verificationToken,
            code: verificationCode.trim(),
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Invalid code. Please try again.')
          return
        }

        // If auto-completed, navigate to onboarding
        if (data.user) {
          completeAuthentication(data.user)
          onClose()
          navigate('/m/onboarding/goals', { replace: true })
          return
        }

        // Otherwise complete registration
        const completeRes = await fetch(`${API}/api/auth/register/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ verificationToken }),
        })
        const completeData = await completeRes.json()

        if (!completeRes.ok) {
          setError(completeData.error || 'Could not complete registration.')
          return
        }

        completeAuthentication(completeData.user)
        onClose()
        navigate('/m/onboarding/goals', { replace: true })
      } catch {
        setError('Connection error. Please check your network.')
      } finally {
        setLoading(false)
      }
    },
    [verificationCode, verificationToken, completeAuthentication, navigate, onClose],
  )

  const title = step === 'account' ? 'Create Account' : 'Verify Email'

  return (
    <BottomSheet open={open} onClose={onClose} title={title} fullHeight>
      {error && <div className="mob-auth-error">{error}</div>}

      {step === 'account' && (
        <>
          <MobileGoogleButton mode="signup" />

          <div className="mob-auth-or">
            <span className="mob-auth-or-text">or</span>
          </div>

          <form onSubmit={handleCreateAccount}>
            <div className="mob-auth-field">
              <label className="mob-auth-label" htmlFor="mob-signup-username">
                Username
              </label>
              <input
                id="mob-signup-username"
                className="mob-auth-input"
                type="text"
                placeholder="Choose a username"
                autoComplete="username"
                autoCapitalize="none"
                value={form.username}
                onChange={(e) => setField('username', e.target.value)}
              />
            </div>

            <div className="mob-auth-field">
              <label className="mob-auth-label" htmlFor="mob-signup-email">
                Email
              </label>
              <input
                id="mob-signup-email"
                className="mob-auth-input"
                type="email"
                placeholder="your@university.edu"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>

            <div className="mob-auth-field">
              <label className="mob-auth-label" htmlFor="mob-signup-pw">
                Password
              </label>
              <input
                id="mob-signup-pw"
                className="mob-auth-input"
                type="password"
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
              />
            </div>

            <div className="mob-auth-field">
              <label className="mob-auth-label" htmlFor="mob-signup-cpw">
                Confirm Password
              </label>
              <input
                id="mob-signup-cpw"
                className="mob-auth-input"
                type="password"
                placeholder="Re-enter your password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)}
              />
            </div>

            <button type="submit" className="mob-auth-submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Continue'}
            </button>

            <p className="mob-auth-switch">
              Already have an account?{' '}
              <button type="button" className="mob-auth-switch-link" onClick={onSwitchToSignin}>
                Sign in
              </button>
            </p>
          </form>
        </>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify}>
          <p
            style={{
              color: 'var(--sh-subtext)',
              fontSize: 'var(--type-sm)',
              marginBottom: 'var(--space-5)',
              lineHeight: 1.5,
            }}
          >
            We sent a verification code to <strong>{form.email}</strong>. Check your inbox and enter
            it below.
          </p>

          <div className="mob-auth-field">
            <label className="mob-auth-label" htmlFor="mob-verify-code">
              Verification Code
            </label>
            <input
              id="mob-verify-code"
              className="mob-auth-input"
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              autoComplete="one-time-code"
              maxLength={8}
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value)
                setError('')
              }}
            />
          </div>

          {error && <p className="mob-auth-error">{error}</p>}

          <button type="submit" className="mob-auth-submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify and Create Account'}
          </button>

          <button
            type="button"
            className="mob-auth-switch-link"
            style={{
              display: 'block',
              margin: 'var(--space-4) auto 0',
              background: 'none',
              border: 'none',
              color: 'var(--sh-brand)',
              fontSize: 'var(--type-sm)',
              cursor: 'pointer',
            }}
            onClick={() => setStep('account')}
          >
            Back to sign up
          </button>
        </form>
      )}
    </BottomSheet>
  )
}
