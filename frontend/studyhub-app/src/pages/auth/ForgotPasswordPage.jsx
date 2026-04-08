import Navbar from '../../components/navbar/Navbar'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { API } from '../../config'
import './ForgotPasswordPage.css'

function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!identifier.trim()) { setError('Please enter your username or email.'); return }
    setError('')
    setLoading(true)
    try {
      await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      setSubmitted(true)
    } catch {
      setError('Could not connect to server. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="forgot-page">
      <Navbar variant="landing" />
      <div className="forgot-center">
        <div className="forgot-card">
          <div className="forgot-top">
            <div className="forgot-icon-wrap">
              <i className="fas fa-key forgot-icon"></i>
            </div>
            <h1 className="forgot-h1">Forgot Password</h1>
            <p className="forgot-sub">Enter your username or email and we&apos;ll send a reset link.</p>
          </div>

          {submitted ? (
            <div>
              <div className="forgot-success-box">
                <i className="fas fa-circle-check"></i>
                If an account exists with that username or email, a reset link has been sent.
              </div>
              <p className="forgot-hint">Check your inbox and spam folder. The email includes your username and a reset link that expires in 1 hour.</p>
              <Link to="/login" className="forgot-back-link">← Back to Login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="forgot-error-box">
                  <i className="fas fa-circle-exclamation"></i>
                  {error}
                </div>
              )}
              <div className="forgot-form-group">
                <label className="forgot-label" htmlFor="identifier">Username or Email</label>
                <div className="forgot-input-wrap">
                  <i className="fas fa-user forgot-input-icon"></i>
                  <input
                    id="identifier"
                    type="text"
                    placeholder="Enter your username or email"
                    autoComplete="username email"
                    value={identifier}
                    onChange={e => { setIdentifier(e.target.value); setError('') }}
                    className="forgot-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="forgot-submit-btn"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <div className="forgot-back-wrap">
                <Link to="/login" className="forgot-back-link">← Back to Login</Link>
              </div>
            </form>
          )}
        </div>
      </div>

      <footer className="forgot-footer">
        Built by students, for students ·{' '}
        <span className="forgot-footer-brand">StudyHub</span> · Open Source on GitHub
      </footer>
    </div>
  )
}

export default ForgotPasswordPage
