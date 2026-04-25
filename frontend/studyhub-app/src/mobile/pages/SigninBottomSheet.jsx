// src/mobile/pages/SigninBottomSheet.jsx
// Mobile sign-in sheet using Design Refresh v3 primitives.
// Uses the same backend endpoint as the web LoginPage.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from '../components/BottomSheet'
import MobileButton from '../components/MobileButton'
import MobileInput from '../components/MobileInput'
import MobileGoogleButton from '../components/MobileGoogleButton'
import haptics from '../lib/haptics'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'

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

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onSwitchToSignup
 */
export default function SigninBottomSheet({ open, onClose, onSwitchToSignup }) {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState('error') // 'error' | 'lockout'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setUsername('')
      setPassword('')
      setError('')
      setErrorKind('error')
      setLoading(false)
    }
  }, [open])

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault()
      if (!username.trim() || !password.trim()) {
        setError('Enter your username and password.')
        setErrorKind('error')
        haptics.warn()
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(`${API}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client': 'mobile',
          },
          credentials: 'include',
          body: JSON.stringify({
            username: username.trim(),
            password,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          const msg = data.error || 'Could not sign you in.'
          const isLocked = res.status === 429 || /locked|too many/i.test(msg)
          setError(msg)
          setErrorKind(isLocked ? 'lockout' : 'error')
          haptics.warn()
          return
        }

        haptics.success()
        completeAuthentication(data.user)
        onClose()

        navigate(data.user?.onboardingCompleted ? '/m/home' : '/m/onboarding/goals', {
          replace: true,
        })
      } catch {
        setError('Connection error. Please check your network.')
        setErrorKind('error')
        haptics.warn()
      } finally {
        setLoading(false)
      }
    },
    [username, password, completeAuthentication, navigate, onClose],
  )

  return (
    <BottomSheet open={open} onClose={onClose} title="Welcome back">
      {error && (
        <div role="alert" className={`sh-m-auth-alert sh-m-auth-alert--${errorKind}`}>
          <WarnIcon />
          <span>{error}</span>
        </div>
      )}

      <div className="sh-m-auth-google">
        <MobileGoogleButton mode="signin" />
      </div>

      <div className="sh-m-auth-or">
        <span className="sh-m-auth-or-text">or</span>
      </div>

      <form onSubmit={handleLogin} className="sh-m-auth-form">
        <MobileInput
          label="Username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            if (error) setError('')
          }}
          inputMode="text"
        />

        <MobileInput
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (error) setError('')
          }}
        />

        <MobileButton type="submit" block size="l" loading={loading} hapticsKind="none">
          Sign In
        </MobileButton>

        <p className="sh-m-auth-switch">
          No account yet?{' '}
          <button type="button" className="sh-m-auth-switch-link" onClick={onSwitchToSignup}>
            Sign up
          </button>
        </p>
      </form>
    </BottomSheet>
  )
}
