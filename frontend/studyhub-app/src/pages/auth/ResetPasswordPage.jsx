import Navbar from '../../components/navbar/Navbar'
import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { API } from '../../config'

const FONT = "'Plus Jakarta Sans', sans-serif"

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
      <Navbar variant="landing" />
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
                    <span>{' '}<Link to="/forgot-password" style={{ color: 'var(--sh-danger-text)', fontWeight: 700 }}>Request a new link</Link></span>
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
                    onFocus={e => (e.target.style.borderColor = 'var(--sh-brand)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--sh-input-border)')}
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
                    onFocus={e => (e.target.style.borderColor = 'var(--sh-brand)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--sh-input-border)')}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                style={{ ...styles.submitBtn, opacity: token ? 1 : 0.5 }}
                onMouseEnter={e => { if (!loading && token) e.target.style.background = 'var(--sh-brand-hover)' }}
                onMouseLeave={e => { if (!loading && token) e.target.style.background = 'var(--sh-brand)' }}
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
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: FONT, background: 'transparent', color: 'var(--sh-text)' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '72px 20px 88px', position: 'relative', zIndex: 1 },
  card: { background: 'var(--sh-panel-bg)', border: '1px solid var(--sh-panel-border)', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 440, boxShadow: 'var(--sh-panel-shadow)', backdropFilter: 'blur(22px)' },
  top: { textAlign: 'center', marginBottom: 32 },
  iconWrap: { marginBottom: 12 },
  icon: { fontSize: 40, color: 'var(--sh-brand)' },
  h1: { fontSize: 26, color: 'var(--sh-heading)', margin: '0 0 6px', fontWeight: 800 },
  sub: { fontSize: 14, color: 'var(--sh-muted)', margin: 0, lineHeight: 1.7 },
  errorBox: { background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger-text)', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 20 },
  successBox: { background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)', color: 'var(--sh-success-text)', borderRadius: 8, padding: '12px 16px', fontSize: 14 },
  formGroup: { marginBottom: 20 },
  label: { display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--sh-subtext)', marginBottom: 8 },
  inputWrap: { position: 'relative' },
  inputIcon: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sh-muted)', fontSize: 15 },
  input: { width: '100%', padding: '12px 14px 12px 40px', border: '1px solid var(--sh-input-border)', borderRadius: 8, fontSize: 15, color: 'var(--sh-input-text)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s', background: 'var(--sh-input-bg)', fontFamily: FONT },
  toggleBtn: { position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 15, padding: 0 },
  submitBtn: { width: '100%', background: 'var(--sh-brand)', color: '#ffffff', border: 'none', borderRadius: 8, padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8, transition: 'background 0.2s', fontFamily: FONT },
  backWrap: { textAlign: 'center', marginTop: 20 },
  backLink: { color: 'var(--sh-brand)', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
  footer: { background: 'transparent', color: 'var(--sh-subtext)', textAlign: 'center', padding: 20, fontSize: 13, borderTop: '1px solid var(--sh-border)' },
}

export default ResetPasswordPage
