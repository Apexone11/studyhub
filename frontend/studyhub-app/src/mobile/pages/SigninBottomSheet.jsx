// src/mobile/pages/SigninBottomSheet.jsx
// Mobile sign-in sheet with username/password authentication.
// Uses the same backend endpoint as the web LoginPage.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from '../components/BottomSheet'
import MobileGoogleButton from '../components/MobileGoogleButton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'

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
  const [loading, setLoading] = useState(false)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setUsername('')
      setPassword('')
      setError('')
      setLoading(false)
    }
  }, [open])

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault()
      if (!username.trim() || !password.trim()) {
        setError('Enter your username and password.')
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(`${API}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Tells the backend this is the Capacitor native shell, so the
            // response `user` includes `authToken` for bearer-auth storage.
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
          setError(data.error || 'Could not sign you in.')
          return
        }

        completeAuthentication(data.user)
        onClose()

        // If user needs onboarding, go there; otherwise go to home
        navigate(data.user?.onboardingCompleted ? '/m/home' : '/m/onboarding/goals', {
          replace: true,
        })
      } catch {
        setError('Connection error. Please check your network.')
      } finally {
        setLoading(false)
      }
    },
    [username, password, completeAuthentication, navigate, onClose],
  )

  return (
    <BottomSheet open={open} onClose={onClose} title="Welcome Back">
      {error && <div className="mob-auth-error">{error}</div>}

      <MobileGoogleButton mode="signin" />

      <div className="mob-auth-or">
        <span className="mob-auth-or-text">or</span>
      </div>

      <form onSubmit={handleLogin}>
        <div className="mob-auth-field">
          <label className="mob-auth-label" htmlFor="mob-signin-user">
            Username
          </label>
          <input
            id="mob-signin-user"
            className="mob-auth-input"
            type="text"
            placeholder="Enter your username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setError('')
            }}
          />
        </div>

        <div className="mob-auth-field">
          <label className="mob-auth-label" htmlFor="mob-signin-pw">
            Password
          </label>
          <input
            id="mob-signin-pw"
            className="mob-auth-input"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
        </div>

        <button type="submit" className="mob-auth-submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <p className="mob-auth-switch">
          No account yet?{' '}
          <button type="button" className="mob-auth-switch-link" onClick={onSwitchToSignup}>
            Sign up
          </button>
        </p>
      </form>
    </BottomSheet>
  )
}
