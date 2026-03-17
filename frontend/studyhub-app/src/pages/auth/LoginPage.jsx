import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'

function getPostLoginPath(user) {
  return user?.role === 'admin' ? '/admin' : '/feed'
}

function Card({ children }) {
  return (
    <div
      style={{
        width: 'min(92vw, 480px)',
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)',
        padding: '32px',
      }}
    >
      {children}
    </div>
  )
}

function Field({ label, children, htmlFor }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid #cbd5e1',
        fontSize: 14,
        color: '#0f172a',
        outline: 'none',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        ...(props.style || {}),
      }}
    />
  )
}

function Button({ children, secondary = false, ...props }) {
  return (
    <button
      {...props}
      style={{
        padding: '12px 18px',
        borderRadius: 10,
        border: secondary ? '1px solid #cbd5e1' : 'none',
        background: secondary ? '#fff' : '#3b82f6',
        color: secondary ? '#475569' : '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.7 : 1,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  )
}

function Message({ tone = 'error', children }) {
  const palette =
    tone === 'info'
      ? { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
      : { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [verificationEmail, setVerificationEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  const [twoFactor, setTwoFactor] = useState({
    active: false,
    username: '',
    deliveryHint: '',
  })

  const [verificationGate, setVerificationGate] = useState(null)

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

      if (data.requiresEmailVerification) {
        setVerificationGate(data)
        setVerificationEmail(data.email || '')
        setCode('')
        return
      }

      if (data.requires2fa) {
        setTwoFactor({
          active: true,
          username: data.username,
          deliveryHint: data.deliveryHint || '',
        })
        setCode('')
        return
      }

      completeAuthentication(data.user)
      navigate(getPostLoginPath(data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendVerificationEmail() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/login/verification/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationToken: verificationGate?.verificationToken,
          email: verificationGate?.emailRequired ? verificationEmail.trim() : undefined,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not send a verification code.')
        return
      }

      setVerificationGate(data)
      setVerificationEmail(data.email || verificationEmail)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyLoginCode(event) {
    event.preventDefault()
    if (!code.trim()) {
      setError('Enter the verification code.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/login/verification/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationToken: verificationGate?.verificationToken,
          code: code.trim(),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not verify that code.')
        return
      }

      if (data.requires2fa) {
        setVerificationGate(null)
        setTwoFactor({
          active: true,
          username: data.username,
          deliveryHint: data.deliveryHint || '',
        })
        setCode('')
        return
      }

      completeAuthentication(data.user)
      navigate(getPostLoginPath(data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyTwoFactor(event) {
    event.preventDefault()
    if (!code.trim()) {
      setError('Enter the sign-in code.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: twoFactor.username,
          code: code.trim(),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not verify the sign-in code.')
        return
      }

      completeAuthentication(data.user)
      navigate(getPostLoginPath(data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#edf0f5',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#0f172a',
      }}
    >
      <Navbar variant="landing" />
      <div style={{ padding: '48px 20px 80px', display: 'grid', placeItems: 'center' }}>
        <Card>
          <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>
            {verificationGate ? 'Verify your email' : twoFactor.active ? 'Two-step verification' : 'Welcome back'}
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
            {verificationGate
              ? 'Unverified accounts must confirm email before they can sign in again.'
              : twoFactor.active
                ? `Enter the 6-digit code sent to ${twoFactor.deliveryHint || 'your email address'}.`
                : 'Sign in to continue to your feed, sheets, dashboard, and admin tools.'}
          </p>

          {error && <Message>{error}</Message>}

          {!verificationGate && !twoFactor.active && (
            <form onSubmit={handleLogin}>
              <Field label="Username" htmlFor="login-username">
                <Input
                  id="login-username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                    setError('')
                    setShowForgot(false)
                  }}
                  autoComplete="username"
                />
              </Field>

              <Field label="Password" htmlFor="login-password">
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                    setShowForgot(false)
                  }}
                  autoComplete="current-password"
                />
              </Field>

              <Button type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
                <Link to="/forgot-password">Forgot username or password?</Link>
                {showForgot && (
                  <div style={{ marginTop: 8, color: '#64748b' }}>
                    If you still remember your username, use password reset after your email is verified.
                  </div>
                )}
              </div>
            </form>
          )}

          {verificationGate && (
            <form onSubmit={handleVerifyLoginCode}>
              <Message tone="info">
                {verificationGate.emailHint
                  ? <>Verification code destination: <strong>{verificationGate.emailHint}</strong></>
                  : 'This account does not have a verified email on file yet.'}
              </Message>

              {verificationGate.emailRequired && (
                <Field label="Email Address" htmlFor="login-verification-email">
                  <Input
                    id="login-verification-email"
                    type="email"
                    value={verificationEmail}
                    onChange={(event) => {
                      setVerificationEmail(event.target.value)
                      setError('')
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </Field>
              )}

              <Field label="Verification Code" htmlFor="login-verification-code">
                <Input
                  id="login-verification-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    setError('')
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22 }}
                  autoFocus
                />
              </Field>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button type="submit" disabled={loading || code.trim().length !== 6}>
                  {loading ? 'Verifying…' : 'Verify Email'}
                </Button>
                <Button
                  type="button"
                  secondary
                  disabled={loading || (verificationGate.emailRequired && !verificationEmail.trim())}
                  onClick={handleSendVerificationEmail}
                >
                  Send / Resend Code
                </Button>
                <Button
                  type="button"
                  secondary
                  onClick={() => {
                    setVerificationGate(null)
                    setCode('')
                    setError('')
                  }}
                >
                  Back
                </Button>
              </div>
            </form>
          )}

          {twoFactor.active && (
            <form onSubmit={handleVerifyTwoFactor}>
              <Field label="Sign-in Code" htmlFor="login-2fa-code">
                <Input
                  id="login-2fa-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    setError('')
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22 }}
                  autoFocus
                />
              </Field>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button type="submit" disabled={loading || code.trim().length !== 6}>
                  {loading ? 'Verifying…' : 'Verify Code'}
                </Button>
                <Button
                  type="button"
                  secondary
                  onClick={() => {
                    setTwoFactor({ active: false, username: '', deliveryHint: '' })
                    setCode('')
                    setError('')
                  }}
                >
                  Back
                </Button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            Don’t have an account? <Link to="/register">Create one here</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
