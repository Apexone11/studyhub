/* ═══════════════════════════════════════════════════════════════════════════
 * LoginPage.jsx — StudyHub sign-in page
 *
 * Layout: Centered glass-morphism card on dark gradient background.
 * Auth options: Username/password form OR Google Sign-In button.
 * No email verification gate — Google handles its own verification,
 * and local accounts can sign in immediately with username + password.
 *
 * Design: Clean Academic Pro — subtle animations, accessible focus rings.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Navbar from '../../components/Navbar'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { fadeInUp } from '../../lib/animations'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { useSession } from '../../lib/session-context'

/* ── Shared constants ──────────────────────────────────────────────────── */
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* ── Input focus/blur style helpers ────────────────────────────────────── */
function handleInputFocus(e) {
  e.target.style.borderColor = '#3b82f6'
  e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'
  e.target.style.background = '#fff'
}
function handleInputBlur(e) {
  e.target.style.borderColor = '#e2e8f0'
  e.target.style.boxShadow = 'none'
  e.target.style.background = '#f8fafc'
}

/* ── Shared input style ────────────────────────────────────────────────── */
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '13px 16px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 14,
  color: '#0f172a',
  outline: 'none',
  background: '#f8fafc',
  fontFamily: FONT,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

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

      /* Successful login — navigate to authenticated home */
      completeAuthentication(data.user)
      navigate(getAuthenticatedHomePath(data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
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

      /* New Google user — redirect to course selection on register page */
      if (data.requiresCourseSelection) {
        navigate('/register', {
          replace: true,
          state: {
            googleCourseSelection: true,
            tempCredential: data.tempCredential,
            googleEmail: data.googleEmail,
            googleName: data.googleName,
          },
        })
        return
      }

      /* Existing Google user — go to authenticated home */
      completeAuthentication(data.user)
      navigate(getAuthenticatedHomePath(data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)',
        fontFamily: FONT,
        color: '#0f172a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Navbar variant="landing" />

      {/* Decorative background orbs (purely visual) */}
      <div style={{ position: 'absolute', top: -120, left: -120, width: 400, height: 400, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.08)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, right: -100, width: 350, height: 350, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 600, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.04)', filter: 'blur(100px)', pointerEvents: 'none' }} />

      {/* ── Main card ────────────────────────────────────────────────── */}
      <div ref={cardRef} style={{ padding: '48px 20px 80px', display: 'grid', placeItems: 'center', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            width: 'min(92vw, 440px)',
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(20px)',
            borderRadius: 24,
            border: '1px solid rgba(226, 232, 240, 0.8)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            padding: '40px 36px',
          }}
        >
          {/* ── Logo mark + heading ──────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)',
              marginBottom: 16,
            }}>
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <path d="M18 6 L18 30 M10 14 L18 6 L26 14 M10 22 L18 14 L26 22" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#0f172a' }}>
              Welcome back
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
              Sign in to your study sheets, dashboard, and more.
            </p>
          </div>

          {/* ── Error message ────────────────────────────────────────── */}
          {error && (
            <div style={{
              marginBottom: 16, padding: '12px 14px', borderRadius: 12,
              border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c',
              fontSize: 13, lineHeight: 1.6,
            }}>
              {error}
            </div>
          )}

          {/* ── Google Sign-In button (shown when client ID configured) ─ */}
          {GOOGLE_CLIENT_ID && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google sign-in was cancelled or failed.')}
                  size="large"
                  width="368"
                  text="signin_with"
                  shape="rectangular"
                  theme="outline"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #e2e8f0)' }} />
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>or continue with</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e2e8f0, transparent)' }} />
              </div>
            </>
          )}

          {/* ── Username + Password form ─────────────────────────────── */}
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="login-username" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Username
              </label>
              <input
                id="login-username"
                value={username}
                onChange={(event) => { setUsername(event.target.value); setError(''); setShowForgot(false) }}
                autoComplete="username"
                placeholder="Enter your username"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="login-password" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError(''); setShowForgot(false) }}
                autoComplete="current-password"
                placeholder="Enter your password"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {/* ── Submit button ───────────────────────────────────────── */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: FONT,
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            {/* ── Forgot password link ────────────────────────────────── */}
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
              <Link to="/forgot-password" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>
                Forgot username or password?
              </Link>
              {showForgot && (
                <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
                  Use the link above to reset your password.
                </div>
              )}
            </div>
          </form>

          {/* ── Register link ────────────────────────────────────────── */}
          <div style={{
            marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9',
            textAlign: 'center', fontSize: 14, color: '#64748b',
          }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#3b82f6', fontWeight: 700, textDecoration: 'none' }}>
              Create one here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
