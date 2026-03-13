import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'
import { useState } from 'react'

function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Validate credentials, call backend login, then persist auth session locally.
  async function handleLogin(e) {
    e.preventDefault()

    if (!username.trim() || !password.trim()) {
      setError('Please fill in both fields.')
      return
    }

    setError('')

    try {
      const res = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        return
      }

      // Save token and user to localStorage
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      // Redirect to dashboard
      window.location.href = '/dashboard'
    } catch {
      setError('Could not connect to server. Make sure the backend is running.')
    }
  }

  return (
    <div style={styles.page}>
      <Navbar />

      <div style={styles.center}>
        <div style={styles.card}>

          {/* TOP */}
          <div style={styles.top}>
            <div style={styles.iconWrap}>
              <i className="fas fa-graduation-cap" style={styles.icon}></i>
            </div>
            <h1 style={styles.h1}>Welcome Back</h1>
            <p style={styles.sub}>Sign in to access your study materials</p>
          </div>

          {/* ERROR */}
          {error && (
            <div style={styles.errorBox}>
              <i className="fas fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* USERNAME */}
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="username">Username</label>
              <div style={styles.inputWrap}>
                <i className="fas fa-user" style={styles.inputIcon}></i>
                <input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  style={styles.input}
                  onFocus={e => e.target.style.borderColor = '#2563eb'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="password">Password</label>
              <div style={styles.inputWrap}>
                <i className="fas fa-lock" style={styles.inputIcon}></i>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  style={{ ...styles.input, paddingRight: '44px' }}
                  onFocus={e => e.target.style.borderColor = '#2563eb'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={styles.toggleBtn}
                  title="Show/hide password"
                >
                  <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                </button>
              </div>
            </div>

            {/* SIGN IN BUTTON */}
            <button
              type="submit"
              style={styles.submitBtn}
              onMouseEnter={e => e.target.style.background = '#1d4ed8'}
              onMouseLeave={e => e.target.style.background = '#2563eb'}
            >
              <i className="fas fa-arrow-right-to-bracket" style={{ marginRight: '8px' }}></i>
              Sign In
            </button>
          </form>

          {/* DIVIDER */}
          <div style={styles.dividerWrap}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>

          {/* REGISTER LINK */}
          <p style={styles.registerText}>
            Don't have an account?{' '}
            <Link to="/register" style={styles.registerLink}>Create one here</Link>
          </p>

        </div>
      </div>

      <footer style={styles.footer}>
        Built by students, for students ·{' '}
        <span style={{ color: '#60a5fa' }}>StudyHub</span> · Open Source on GitHub
      </footer>
    </div>
  )
}
const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Arial, sans-serif',
    background: '#f0f4f8',
    color: '#111827',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
  },
  top: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  iconWrap: {
    marginBottom: '12px',
  },
  icon: {
    fontSize: '40px',
    color: '#2563eb',
  },
  h1: {
    fontSize: '26px',
    color: '#1e3a5f',
    marginBottom: '6px',
    fontWeight: 'bold',
  },
  sub: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: '8px',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9ca3af',
    fontSize: '15px',
  },
  input: {
    width: '100%',
    padding: '12px 14px 12px 40px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '15px',
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  toggleBtn: {
    position: 'absolute',
    right: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9ca3af',
    fontSize: '15px',
    padding: 0,
  },
  submitBtn: {
    width: '100%',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'background 0.2s',
  },
  dividerWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '24px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#e5e7eb',
  },
  dividerText: {
    fontSize: '13px',
    color: '#9ca3af',
  },
  registerText: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  registerLink: {
    color: '#2563eb',
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  footer: {
    background: '#1e3a5f',
    color: '#94a3b8',
    textAlign: 'center',
    padding: '20px',
    fontSize: '13px',
  },

}

export default LoginPage