// src/mobile/pages/SignupBottomSheet.jsx
// Two-step mobile signup using Design Refresh v3 primitives.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from '../components/BottomSheet'
import MobileButton from '../components/MobileButton'
import MobileInput from '../components/MobileInput'
import MobileGoogleButton from '../components/MobileGoogleButton'
import haptics from '../lib/haptics'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/

function WarnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l10 18H2L12 3zM12 10v4M12 17.5v0.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProgressDots({ count, active }) {
  return (
    <div className="sh-m-auth-progress" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`sh-m-auth-progress__dot ${i <= active ? 'sh-m-auth-progress__dot--active' : ''}`.trim()}
        />
      ))}
    </div>
  )
}

export default function SignupBottomSheet({ open, onClose, onSwitchToSignin }) {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()

  const [step, setStep] = useState('account')
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

  const setField = useCallback(
    (key, value) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      if (error) setError('')
    },
    [error],
  )

  const handleCreateAccount = useCallback(
    async (e) => {
      e.preventDefault()

      if (!form.username.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
        setError('Please fill in all fields.')
        haptics.warn()
        return
      }
      if (!USERNAME_RE.test(form.username.trim())) {
        setError('Username must be 3-20 characters: letters, numbers, or underscores.')
        haptics.warn()
        return
      }
      if (!EMAIL_RE.test(form.email.trim())) {
        setError('Please enter a valid email address.')
        haptics.warn()
        return
      }
      if (!PASSWORD_RE.test(form.password)) {
        setError('Password needs 8+ characters, a capital letter, and a number.')
        haptics.warn()
        return
      }
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match.')
        haptics.warn()
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(`${API}/api/auth/register/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Required so the backend's isMobileClient() returns true and
            // issueAuthenticatedSession emits the bearer token for native.
            'X-Client': 'mobile',
          },
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
          haptics.warn()
          return
        }

        haptics.tap()
        setVerificationToken(data.verificationToken || '')
        setStep('verify')
      } catch {
        setError('Connection error. Please check your network.')
        haptics.warn()
      } finally {
        setLoading(false)
      }
    },
    [form],
  )

  const handleVerify = useCallback(
    async (e) => {
      e.preventDefault()
      if (!verificationCode.trim()) {
        setError('Enter the code sent to your email.')
        haptics.warn()
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(`${API}/api/auth/register/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client': 'mobile',
          },
          credentials: 'include',
          body: JSON.stringify({
            verificationToken,
            code: verificationCode.trim(),
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Invalid code. Please try again.')
          haptics.warn()
          return
        }

        if (data.user) {
          haptics.success()
          completeAuthentication(data.user)
          onClose()
          navigate('/m/onboarding/goals', { replace: true })
          return
        }

        const completeRes = await fetch(`${API}/api/auth/register/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client': 'mobile',
          },
          credentials: 'include',
          body: JSON.stringify({ verificationToken }),
        })
        const completeData = await completeRes.json()

        if (!completeRes.ok) {
          setError(completeData.error || 'Could not complete registration.')
          haptics.warn()
          return
        }

        haptics.success()
        completeAuthentication(completeData.user)
        onClose()
        navigate('/m/onboarding/goals', { replace: true })
      } catch {
        setError('Connection error. Please check your network.')
        haptics.warn()
      } finally {
        setLoading(false)
      }
    },
    [verificationCode, verificationToken, completeAuthentication, navigate, onClose],
  )

  const title = step === 'account' ? 'Create account' : 'Verify email'
  const activeStep = useMemo(() => (step === 'account' ? 0 : 1), [step])

  return (
    <BottomSheet open={open} onClose={onClose} title={title} fullHeight>
      <ProgressDots count={2} active={activeStep} />

      {error && (
        <div role="alert" className="sh-m-auth-alert sh-m-auth-alert--error">
          <WarnIcon />
          <span>{error}</span>
        </div>
      )}

      {step === 'account' && (
        <>
          <div className="sh-m-auth-google">
            <MobileGoogleButton mode="signup" />
          </div>

          <div className="sh-m-auth-or">
            <span className="sh-m-auth-or-text">or</span>
          </div>

          <form onSubmit={handleCreateAccount} className="sh-m-auth-form">
            <MobileInput
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              value={form.username}
              onChange={(e) => setField('username', e.target.value)}
            />

            <MobileInput
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />

            <MobileInput
              label="Password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
            />

            <MobileInput
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setField('confirmPassword', e.target.value)}
            />

            <MobileButton type="submit" block size="l" loading={loading} hapticsKind="none">
              Continue
            </MobileButton>

            <p className="sh-m-auth-switch">
              Already have an account?{' '}
              <button type="button" className="sh-m-auth-switch-link" onClick={onSwitchToSignin}>
                Sign in
              </button>
            </p>
          </form>
        </>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} className="sh-m-auth-form">
          <p className="sh-m-auth-help">
            We sent a verification code to <strong>{form.email}</strong>. Check your inbox and enter
            it below.
          </p>

          <MobileInput
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={verificationCode}
            onChange={(e) => {
              setVerificationCode(e.target.value)
              if (error) setError('')
            }}
          />

          <MobileButton type="submit" block size="l" loading={loading} hapticsKind="none">
            Verify and create account
          </MobileButton>

          <MobileButton
            type="button"
            variant="ghost"
            size="m"
            block
            onClick={() => setStep('account')}
            hapticsKind="select"
          >
            Back to sign up
          </MobileButton>
        </form>
      )}
    </BottomSheet>
  )
}
