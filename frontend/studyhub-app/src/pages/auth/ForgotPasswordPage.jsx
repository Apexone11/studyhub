import Navbar from '../../components/Navbar'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { API } from '../../config'

function ForgotPasswordPage() {
  const [username, setUsername] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim()) { setError('Please enter your username.'); return }
    setError('')
    setLoading(true)
    try {
      await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })
      setSubmitted(true)
    } catch {
      setError('Could not connect to server. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.center}>
        <div style={styles.card}>
          <div style={styles.top}>
            <div style={styles.iconWrap}>
              <i className="fas fa-key" style={styles.icon}></i>
            </div>
            <h1 style={styles.h1}>Forgot Password</h1>
            <p style={styles.sub}>Enter your username and we&apos;ll send a reset link to your email.</p>
          </div>

          {submitted ? (
            <div>
              <div style={styles.successBox}>
                <i className="fas fa-circle-check" style={{ marginRight: 8 }}></i>
                If we have an email on file for that account, a reset link has been sent.
              </div>
              <p style={styles.hint}>Check your inbox and spam folder. The link expires in 1 hour.</p>
              <Link to="/login" style={styles.backLink}>← Back to Login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={styles.errorBox}>
                  <i className="fas fa-circle-exclamation" style={{ marginRight: 8 }}></i>
                  {error}
                </div>
              )}
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
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={styles.submitBtn}
                onMouseEnter={e => { if (!loading) e.target.style.background = '#1d4ed8' }}
                onMouseLeave={e => { if (!loading) e.target.style.background = '#2563eb' }}
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <div style={styles.backWrap}>
                <Link to="/login" style={styles.backLink}>← Back to Login</Link>
              </div>
            </form>
          )}
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
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', background: '#f0f4f8', color: '#111827' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' },
  card: { background: 'white', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' },
  top: { textAlign: 'center', marginBottom: 32 },
  iconWrap: { marginBottom: 12 },
  icon: { fontSize: 40, color: '#2563eb' },
  h1: { fontSize: 26, color: '#1e3a5f', marginBottom: 6, fontWeight: 'bold', margin: '0 0 6px' },
  sub: { fontSize: 14, color: '#6b7280', margin: 0 },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 20 },
  successBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: 8, padding: '12px 16px', fontSize: 14, marginBottom: 16 },
  hint: { fontSize: 13, color: '#6b7280', textAlign: 'center', margin: '0 0 20px' },
  formGroup: { marginBottom: 20 },
  label: { display: 'block', fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
  inputWrap: { position: 'relative' },
  inputIcon: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 15 },
  input: { width: '100%', padding: '12px 14px 12px 40px', border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 15, color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', fontFamily: 'Arial, sans-serif' },
  submitBtn: { width: '100%', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: 14, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginTop: 8, transition: 'background 0.2s', fontFamily: 'Arial, sans-serif' },
  backWrap: { textAlign: 'center', marginTop: 20 },
  backLink: { color: '#2563eb', fontSize: 14, fontWeight: 'bold', textDecoration: 'none' },
  footer: { background: '#1e3a5f', color: '#94a3b8', textAlign: 'center', padding: 20, fontSize: 13 },
}

export default ForgotPasswordPage
