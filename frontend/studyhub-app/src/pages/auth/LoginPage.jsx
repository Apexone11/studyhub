/* ═══════════════════════════════════════════════════════════════════════════
 * LoginPage.jsx — StudyHub sign-in page
 *
 * Layout: Centered card on dark gradient background.
 * Auth options: Username/password form OR Google Sign-In button.
 * No email verification gate — Google handles its own verification,
 * and local accounts can sign in immediately with username + password.
 *
 * Design: Direction A — Campus Lab tokens, no inline hex colors.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Navbar from '../../components/navbar/Navbar'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { fadeInUp } from '../../lib/animations'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { useSession, SESSION_EXPIRED_FLAG } from '../../lib/session-context'
import { LOGGED_OUT_FLAG } from '../../lib/session'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()
  const cardRef = useRef(null)

  /* ── State ─────────────────────────────────────────────────────────── */
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loggedOut, setLoggedOut] = useState(false)

  /* ── Detect session-expired redirect ─────────────────────────────── */
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_FLAG)) {
        setSessionExpired(true)
        sessionStorage.removeItem(SESSION_EXPIRED_FLAG)
      }
      if (sessionStorage.getItem(LOGGED_OUT_FLAG)) {
        setLoggedOut(true)
        sessionStorage.removeItem(LOGGED_OUT_FLAG)
      }
    } catch {
      /* private mode */
    }
    // Also check URL param set by session-context redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('expired') === '1') {
      setSessionExpired(true)
      // Clean the URL so a refresh does not re-show the banner
      params.delete('expired')
      const clean = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (clean ? `?${clean}` : ''))
    }
  }, [])

  /* ── Card entrance animation ───────────────────────────────────────── */
  useEffect(() => {
    if (cardRef.current) fadeInUp(cardRef.current, { duration: 450, y: 20 })
  }, [])

  /* ── Username + password login handler ─────────────────────────────── */
  async function handleLogin(event) {
    event.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Enter your username and password.')
      return
    }

    setLoading(true)
    setError('')
    setShowForgot(false)

    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not sign you in.')
        setShowForgot(Boolean(data.showForgot))
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

  /* ── Google OAuth success handler ──────────────────────────────────── */
  async function handleGoogleSuccess(credentialResponse) {
    if (!credentialResponse?.credential) {
      setError('Google sign-in did not return a valid credential.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Google sign-in failed.')
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

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="login-page">
      <Navbar variant="landing" />

      {/* Decorative background orbs */}
      <div className="login-orb login-orb--blue" />
      <div className="login-orb login-orb--purple" />
      <div className="login-orb login-orb--green" />

      {/* ── Main card ────────────────────────────────────────────────── */}
      <main id="main-content" ref={cardRef} className="login-main">
        <div className="login-card">
          {/* ── Logo mark + heading ──────────────────────────────────── */}
          <div className="login-header">
            <div className="login-logo-mark">
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <path
                  d="M18 6 L18 30 M10 14 L18 6 L26 14 M10 22 L18 14 L26 22"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="login-h1">Welcome back</h1>
            <p className="login-subtitle">Sign in to your study sheets, dashboard, and more.</p>
          </div>

          {/* ── Session-expired banner ──────────────────────────────── */}
          {sessionExpired && (
            <div role="status" className="login-alert login-alert--warning">
              <span className="login-alert-icon" aria-hidden="true">
                &#x1f512;
              </span>
              <span>Your session expired. Sign in again to pick up where you left off.</span>
            </div>
          )}

          {/* ── Logged-out banner ─────────────────────────────────── */}
          {loggedOut && !sessionExpired && (
            <div role="status" className="login-alert login-alert--info">
              You've been signed out.
            </div>
          )}

          {/* ── Error message ────────────────────────────────────────── */}
          {error && (
            <div role="alert" className="login-alert login-alert--danger">
              {error}
            </div>
          )}

          {/* ── Google Sign-In button ─────────────────────────────────── */}
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="login-google-wrap">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google sign-in was cancelled or failed.')}
                  size="large"
                  width="300"
                  text="signin_with"
                  shape="rectangular"
                  theme="outline"
                />
              </div>
              <div className="login-divider">
                <div className="login-divider-line login-divider-line--left" />
                <span className="login-divider-text">or continue with</span>
                <div className="login-divider-line login-divider-line--right" />
              </div>
            </>
          )}

          {/* ── Username + Password form ─────────────────────────────── */}
          <form onSubmit={handleLogin}>
            <div className="login-field">
              <label htmlFor="login-username" className="login-label">
                Username
              </label>
              <input
                id="login-username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  setError('')
                  setShowForgot(false)
                }}
                autoComplete="username"
                placeholder="Enter your username"
                className="login-input"
              />
            </div>

            <div className="login-field login-field--last">
              <label htmlFor="login-password" className="login-label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                  setShowForgot(false)
                }}
                autoComplete="current-password"
                placeholder="Enter your password"
                className="login-input"
              />
            </div>

            <button type="submit" disabled={loading} className="login-submit-btn">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="login-forgot-wrap">
              <Link to="/forgot-password" className="login-link">
                Forgot username or password?
              </Link>
              {showForgot && (
                <div className="login-forgot-hint">Use the link above to reset your password.</div>
              )}
            </div>
          </form>

          {/* ── Register link ────────────────────────────────────────── */}
          <div className="login-register-section">
            Don't have an account?{' '}
            <Link to="/register" className="login-link login-link--bold">
              Create one here
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
