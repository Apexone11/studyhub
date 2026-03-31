import Navbar from '../../components/navbar/Navbar'
import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { API } from '../../config'

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (!t) setError('No reset token found. Please request a new reset link.')
    else setToken(t)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!newPassword || !confirmPassword) { setError('Please fill in all fields.'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }

    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return }
      setSuccess(true)
      setTimeout(() => navigate('/login?reset=success'), 2500)
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
              <i className="fas fa-lock-open" style={styles.icon}></i>
            </div>
            <h1 style={styles.h1}>Set New Password</h1>
            <p style={styles.sub}>Choose a strong new password for your account.</p>
          </div>

          {success ? (
            <div style={styles.successBox}>
              <i className="fas fa-circle-check" style={{ marginRight: 8 }}></i>
              Password updated! Redirecting to login…
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={styles.errorBox}>
                  <i className="fas fa-circle-exclamation" style={{ marginRight: 8 }}></i>
                  {error}
                  {error.includes('invalid') || error.includes('expired') ? (
                    <span>{' '}<Link to="/forgot-password" style={{ color: 'var(--sh-danger)', fontWeight: 'bold' }}>Request a new link</Link></span>
                  ) : null}
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label} htmlFor="newPassword">New Password</label>
                <div style={styles.inputWrap}>
                  <i className="fas fa-lock" style={styles.inputIcon}></i>
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setError('') }}
                    style={{ ...styles.input, paddingRight: 44 }}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} style={styles.toggleBtn}>
                    <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                  </button>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} htmlFor="confirmPassword">Confirm Password</label>
                <div style={styles.inputWrap}>
                  <i className="fas fa-lock" style={styles.inputIcon}></i>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                    style={styles.input}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                style={{ ...styles.submitBtn, opacity: token ? 1 : 0.5 }}
                onMouseEnter={e => { if (!loading && token) e.target.style.background = '#1d4ed8' }}
                onMouseLeave={e => { if (!loading && token) e.target.style.background = '#2563eb' }}
              >
                {loading ? 'Saving…' : 'Set New Password'}
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
        <span style={{ color: 'var(--sh-brand)' }}>StudyHub</span> · Open Source on GitHub
      </footer>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', background: 'var(--sh-soft)', color: 'var(--sh-heading)' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' },
  card: { background: 'var(--sh-surface)', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' },
  top: { textAlign: 'center', marginBottom: 32 },
  iconWrap: { marginBottom: 12 },
  icon: { fontSize: 40, color: 'var(--sh-brand)' },
  h1: { fontSize: 26, color: 'var(--sh-slate-800)', margin: '0 0 6px', fontWeight: 'bold' },
  sub: { fontSize: 14, color: 'var(--sh-slate-500)', margin: 0 },
  errorBox: { background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger)', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 20 },
  successBox: { background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)', color: 'var(--sh-success-text)', borderRadius: 8, padding: '12px 16px', fontSize: 14 },
  formGroup: { marginBottom: 20 },
  label: { display: 'block', fontSize: 14, fontWeight: 'bold', color: 'var(--sh-slate-700)', marginBottom: 8 },
  inputWrap: { position: 'relative' },
  inputIcon: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sh-slate-400)', fontSize: 15 },
  input: { width: '100%', padding: '12px 14px 12px 40px', border: '2px solid var(--sh-border)', borderRadius: 8, fontSize: 15, color: 'var(--sh-heading)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', fontFamily: 'Arial, sans-serif' },
  toggleBtn: { position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-slate-400)', fontSize: 15, padding: 0 },
  submitBtn: { width: '100%', background: 'var(--sh-brand)', color: 'white', border: 'none', borderRadius: 8, padding: 14, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginTop: 8, transition: 'background 0.2s', fontFamily: 'Arial, sans-serif' },
  backWrap: { textAlign: 'center', marginTop: 20 },
  backLink: { color: 'var(--sh-brand)', fontSize: 14, fontWeight: 'bold', textDecoration: 'none' },
  footer: { background: 'var(--sh-slate-800)', color: 'var(--sh-subtext)', textAlign: 'center', padding: 20, fontSize: 13 },
}

export default ResetPasswordPage
