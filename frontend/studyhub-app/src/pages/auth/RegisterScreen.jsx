/* ═══════════════════════════════════════════════════════════════════════════
 * RegisterScreen.jsx — StudyHub account creation page
 *
 * Three-step flow: Account -> Verify Email -> Courses.
 * Google OAuth flow: Google button -> Courses step (skips account form + verification).
 *
 * Design: Direction A — Campus Lab tokens, no inline hex colors.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Navbar from '../../components/Navbar'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { fadeInUp } from '../../lib/animations'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { trackSignupConversion, trackEvent } from '../../lib/telemetry'
import { useSession } from '../../lib/session-context'
import CourseListPicker from '../../components/CourseListPicker'
import './RegisterScreen.css'

/* ── Validation rules ──────────────────────────────────────────────────── */
const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

/* ── Password strength indicator ───────────────────────────────────────── */
function PasswordHint({ password, confirmPassword }) {
  if (!password && !confirmPassword) return null

  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: '1 capital letter', ok: /[A-Z]/.test(password) },
    { label: '1 number', ok: /\d/.test(password) },
    { label: 'Passwords match', ok: password === confirmPassword && confirmPassword.length > 0 },
  ]

  return (
    <div className="password-hints-grid">
      {checks.map((check) => (
        <div key={check.label} className={`password-hint ${check.ok ? 'password-hint--pass' : 'password-hint--fail'}`}>
          {check.ok ? '\u2713' : '\u25CB'} {check.label}
        </div>
      ))}
    </div>
  )
}

export default function RegisterScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { completeAuthentication } = useSession()
  const cardRef = useRef(null)

  /* ── Google course selection flow (redirected from login page) ──────── */
  const googleState = location.state
  const isGoogleCourseFlow = Boolean(googleState?.googleCourseSelection && googleState?.tempCredential)

  /* ── State ─────────────────────────────────────────────────────────── */
  const [step, setStep] = useState(isGoogleCourseFlow ? 'courses' : 'account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(isGoogleCourseFlow ? `Signed in as ${googleState.googleName || 'Google user'}. Choose your courses to finish setup.` : '')
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [schools, setSchools] = useState([])
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [customCourses, setCustomCourses] = useState([])
  const [customCourseDraft, setCustomCourseDraft] = useState({ code: '', name: '' })
  const [googleCredential, setGoogleCredential] = useState(isGoogleCourseFlow ? googleState.tempCredential : null)
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [deliveryHint, setDeliveryHint] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState(null)
  const [resendCountdown, setResendCountdown] = useState(0)

  /* Form state for account step */
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    schoolId: '',
  })

  /* ── Card entrance animation ───────────────────────────────────────── */
  useEffect(() => {
    if (cardRef.current) fadeInUp(cardRef.current, { duration: 450, y: 20 })
  }, [])

  /* ── Resend countdown timer ──────────────────────────────────────── */
  useEffect(() => {
    if (!resendAvailableAt) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000))
      setResendCountdown(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [resendAvailableAt])

  /* ── Load course catalog when entering courses step ────────────────── */
  useEffect(() => {
    if (step !== 'courses' || schools.length > 0 || catalogLoading) return

    let active = true
    setCatalogLoading(true)
    setCatalogError('')

    fetch(`${API}/api/courses/schools`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the course catalog.')
        return response.json()
      })
      .then((data) => {
        if (!active) return
        setSchools(Array.isArray(data) ? data : [])
      })
      .catch((loadError) => {
        if (!active) return
        setCatalogError(loadError.message || 'Could not load the course catalog.')
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })

    return () => { active = false }
  }, [catalogLoading, schools.length, step])

  /* ── Derived state ─────────────────────────────────────────────────── */
  const selectedSchool = useMemo(
    () => schools.find((school) => String(school.id) === String(form.schoolId)) || null,
    [form.schoolId, schools],
  )
  const availableCourses = selectedSchool?.courses || []

  /* ── Form helpers ──────────────────────────────────────────────────── */
  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
    setSuccess('')
  }

  function validateAccountFields() {
    if (!form.username.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
      return 'Please fill in all required fields.'
    }
    if (!RULES.username.test(form.username.trim())) {
      return 'Username must be 3-20 characters using letters, numbers, or underscores.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Please enter a valid email address.'
    }
    if (!RULES.password.test(form.password)) {
      return 'Password must be at least 8 characters and include a capital letter and a number.'
    }
    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match.'
    }
    if (!form.termsAccepted) {
      return 'You must accept the Terms of Use and Community Guidelines.'
    }
    return ''
  }

  /* ── Account creation handler — starts verification pipeline ────────── */
  async function handleCreateAccount(event) {
    event.preventDefault()
    const validationError = validateAccountFields()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API}/api/auth/register/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword,
          termsAccepted: form.termsAccepted,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not create your account.')
        return
      }

      setVerificationToken(data.verificationToken)
      setDeliveryHint(data.deliveryHint || form.email.trim())
      setResendAvailableAt(data.resendAvailableAt)
      setStep('verify')
      trackEvent('signup_started', { method: 'local' })
      setSuccess(`We sent a 6-digit code to ${data.deliveryHint || form.email.trim()}.`)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Verify email code handler ────────────────────────────────────── */
  async function handleVerifyCode(event) {
    event.preventDefault()
    const trimmedCode = verificationCode.trim()
    if (!trimmedCode || trimmedCode.length !== 6) {
      setError('Please enter the 6-digit code from your email.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API}/api/auth/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          verificationToken,
          code: trimmedCode,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Invalid or expired code.')
        return
      }

      setStep('courses')
      setSuccess('Email verified! Now choose your courses, or skip for now.')
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Resend verification code handler ─────────────────────────────── */
  async function handleResendCode() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/register/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ verificationToken }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not resend code.')
        return
      }

      setResendAvailableAt(data.resendAvailableAt)
      setVerificationCode('')
      setSuccess(`New code sent to ${deliveryHint}.`)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Google OAuth success handler ──────────────────────────────────── */
  async function handleGoogleSuccess(credentialResponse) {
    if (!credentialResponse?.credential) {
      setError('Google sign-up did not return a valid credential.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Google sign-up failed.')
        return
      }

      if (data.requiresCourseSelection) {
        setGoogleCredential(data.tempCredential)
        setStep('courses')
        setSuccess(`Signed in as ${data.googleName || 'Google user'}. Choose your courses to finish setup.`)
        return
      }

      completeAuthentication(data.user)
      trackSignupConversion()
      navigate(getAuthenticatedHomePath(data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Course selection helpers ───────────────────────────────────────── */
  function toggleCourse(courseId) {
    setSelectedCourseIds((current) => (
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : current.length < 10
          ? [...current, courseId]
          : current
    ))
  }

  function addCustomCourse() {
    const code = customCourseDraft.code.trim().toUpperCase()
    const name = customCourseDraft.name.trim()

    if (!form.schoolId) {
      setError('Choose a school before adding a custom course.')
      return
    }
    if (!code || !name) {
      setError('Enter both a course code and a course name.')
      return
    }
    if (selectedCourseIds.length + customCourses.length >= 10) {
      setError('You can add up to 10 total courses.')
      return
    }
    if (customCourses.some((course) => course.code === code)) {
      setError('That custom course has already been added.')
      return
    }

    setCustomCourses((current) => [...current, { code, name }])
    setCustomCourseDraft({ code: '', name: '' })
    setError('')
  }

  /* ── Complete registration with courses ────────────────────────────── */
  async function handleCompleteRegistration(skipCourses = false) {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (googleCredential) {
        const response = await fetch(`${API}/api/auth/google/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            credential: googleCredential,
            schoolId: skipCourses ? null : (form.schoolId ? Number(form.schoolId) : null),
            courseIds: skipCourses ? [] : selectedCourseIds,
            customCourses: skipCourses ? [] : customCourses,
          }),
        })
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Could not finish registration.')
          return
        }

        completeAuthentication(data.user)
        trackSignupConversion()
        trackEvent('signup_completed', { method: 'google' })
        navigate('/dashboard?welcome=1', { replace: true })
        return
      }

      const response = await fetch(`${API}/api/auth/register/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          verificationToken,
          schoolId: skipCourses ? null : (form.schoolId ? Number(form.schoolId) : null),
          courseIds: skipCourses ? [] : selectedCourseIds,
          customCourses: skipCourses ? [] : customCourses,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not finish registration.')
        return
      }

      completeAuthentication(data.user)
      trackSignupConversion()
      trackEvent('signup_completed', { method: 'local', skipped_courses: skipCourses })
      navigate('/dashboard?welcome=1', { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step configuration ────────────────────────────────────────────── */
  const steps = googleCredential
    ? [['courses', 'Courses']]
    : [['account', 'Account'], ['verify', 'Verify'], ['courses', 'Courses']]
  const stepOrder = steps.map(([key]) => key)

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="register-page">
      <Navbar variant="landing" />

      {/* Decorative background orbs */}
      <div className="register-orb register-orb--blue" />
      <div className="register-orb register-orb--purple" />

      {/* ── Main card ──────────────────────────────────────────────── */}
      <main id="main-content" ref={cardRef} className="register-main">
        <div className="register-card">
          {/* ── Step indicator ──────────────────────────────────────── */}
          <div className="register-steps">
            {steps.map(([key, label], index) => {
              const currentIndex = stepOrder.indexOf(step)
              const thisIndex = stepOrder.indexOf(key)
              const complete = thisIndex < currentIndex
              const active = key === step

              return (
                <div key={key} className="register-step">
                  <div className="register-step-header">
                    <div className={`register-step-number ${active || complete ? 'register-step-number--active' : 'register-step-number--inactive'}`}>
                      {complete ? '\u2713' : index + 1}
                    </div>
                    <span className={`register-step-label ${active ? 'register-step-label--active' : 'register-step-label--inactive'}`}>
                      {label}
                    </span>
                  </div>
                  <div className={`register-step-bar ${complete || active ? 'register-step-bar--active' : 'register-step-bar--inactive'}`} />
                </div>
              )
            })}
          </div>

          {/* ── Error/success messages ──────────────────────────────── */}
          {error && (
            <div role="alert" className="register-alert register-alert--danger">{error}</div>
          )}
          {success && (
            <div className="register-alert register-alert--success">{success}</div>
          )}

          {/* ══════════════════════════════════════════════════════════
           * STEP 1: Account Creation
           * ══════════════════════════════════════════════════════════ */}
          {step === 'account' && (
            <form onSubmit={handleCreateAccount}>
              <div className="register-section-header">
                <div className="register-logo-mark register-logo-mark--brand">
                  <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
                    <path d="M18 6 L18 30 M10 14 L18 6 L26 14 M10 22 L18 14 L26 22" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 className="register-h1">Create your account</h1>
                <p className="register-subtitle">Join thousands of students studying smarter together.</p>
              </div>

              {/* Google Sign-Up button */}
              {GOOGLE_CLIENT_ID && (
                <>
                  <div className="register-google-wrap">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => setError('Google sign-up was cancelled or failed.')}
                      size="large"
                      width="380"
                      text="signup_with"
                      shape="rectangular"
                      theme="outline"
                    />
                  </div>
                  <div className="register-divider">
                    <div className="register-divider-line register-divider-line--left" />
                    <span className="register-divider-text">or create an account</span>
                    <div className="register-divider-line register-divider-line--right" />
                  </div>
                </>
              )}

              {/* Username */}
              <div>
                <label htmlFor="register-username" className="register-label">Username</label>
                <input
                  id="register-username"
                  value={form.username}
                  onChange={(event) => setField('username', event.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  className="register-input"
                />
                <div className="register-hint">3-20 chars, letters/numbers/_</div>
              </div>

              {/* Email */}
              <div className="register-field" style={{ marginTop: 14 }}>
                <label htmlFor="register-email" className="register-label">Email</label>
                <input
                  id="register-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  placeholder="you@university.edu"
                  autoComplete="email"
                  className="register-input"
                />
                <div className="register-hint">We&apos;ll send a verification code to confirm.</div>
              </div>

              {/* Password + Confirm row */}
              <div className="register-pw-grid">
                <div>
                  <label htmlFor="register-password" className="register-label">Password</label>
                  <input
                    id="register-password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setField('password', event.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    className="register-input"
                  />
                </div>
                <div>
                  <label htmlFor="register-confirm-password" className="register-label">Confirm Password</label>
                  <input
                    id="register-confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setField('confirmPassword', event.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    className="register-input"
                  />
                </div>
              </div>

              <PasswordHint password={form.password} confirmPassword={form.confirmPassword} />

              {/* Terms checkbox */}
              <label className="register-terms">
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(event) => setField('termsAccepted', event.target.checked)}
                />
                <span>
                  I agree to the <Link to="/terms">Terms of Use</Link> and <Link to="/guidelines">Community Guidelines</Link>.
                </span>
              </label>

              <button type="submit" disabled={loading} className="register-btn-primary">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════
           * STEP 2: Email Verification
           * ══════════════════════════════════════════════════════════ */}
          {step === 'verify' && (
            <form onSubmit={handleVerifyCode}>
              <div className="register-section-header">
                <div className="register-logo-mark register-logo-mark--verify">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--sh-link)" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M22 7l-10 7L2 7"/>
                  </svg>
                </div>
                <h1 className="register-h1">Check your email</h1>
                <p className="register-subtitle">
                  We sent a 6-digit code to <strong style={{ color: 'var(--sh-text)' }}>{deliveryHint}</strong>
                </p>
              </div>

              <div className="register-field">
                <label htmlFor="verify-code" className="register-label">Verification code</label>
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  className="register-input register-input--code"
                />
              </div>

              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                className="register-btn-primary"
              >
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>

              <div className="register-center-text" style={{ marginTop: 16 }}>
                {resendCountdown > 0 ? (
                  <span>Resend available in {resendCountdown}s</span>
                ) : (
                  <button type="button" disabled={loading} onClick={handleResendCode} className="register-btn-ghost">
                    Resend code
                  </button>
                )}
              </div>

              <div className="register-center-text" style={{ marginTop: 12 }}>
                Check your spam folder if you don&apos;t see it. Code expires in 15 minutes.
              </div>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════
           * STEP 3: Course Selection
           * ══════════════════════════════════════════════════════════ */}
          {step === 'courses' && (
            <div>
              <div className="register-section-header">
                <div className="register-logo-mark register-logo-mark--courses">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--sh-success)" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </div>
                <h1 className="register-h1">Choose your courses</h1>
                <p className="register-subtitle">Add your school and courses, or skip and set up later.</p>
              </div>

              {catalogError && (
                <div className="register-alert--danger-row">
                  <span>{catalogError}</span>
                  <button onClick={() => { setCatalogError(''); setSchools([]) }} className="register-btn-small">
                    Retry
                  </button>
                </div>
              )}

              {/* School selector */}
              <div className="register-field">
                <label htmlFor="register-school" className="register-label">School</label>
                <select
                  id="register-school"
                  value={form.schoolId}
                  onChange={(event) => {
                    setField('schoolId', event.target.value)
                    setSelectedCourseIds([])
                    setCustomCourses([])
                  }}
                  className="register-select"
                >
                  <option value="">Skip school selection for now</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.short} — {school.name}{school.city ? `, ${school.city}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {catalogLoading && (
                <div className="register-loading">Loading course catalog...</div>
              )}

              {selectedSchool && availableCourses.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div className="register-catalog-label">Course Catalog</div>
                  <CourseListPicker
                    courses={availableCourses}
                    selectedIds={selectedCourseIds}
                    onToggle={toggleCourse}
                    maxSelections={10}
                    maxHeight={220}
                  />
                </div>
              )}

              {/* Custom course input */}
              <div className="register-custom-course-box">
                <div className="register-catalog-label">Add a custom course</div>
                <div className="register-custom-course-grid">
                  <input
                    value={customCourseDraft.code}
                    onChange={(event) => setCustomCourseDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    placeholder="Code"
                    className="register-input"
                  />
                  <input
                    value={customCourseDraft.name}
                    onChange={(event) => setCustomCourseDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Course name"
                    className="register-input"
                  />
                  <button type="button" onClick={addCustomCourse} className="register-btn-add">
                    Add
                  </button>
                </div>
                {customCourses.length > 0 && (
                  <div className="register-pills">
                    {customCourses.map((course) => (
                      <span key={course.code} className="register-pill">
                        {course.code}
                        <button
                          type="button"
                          onClick={() => setCustomCourses((current) => current.filter((item) => item.code !== course.code))}
                          className="register-pill-remove"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="register-actions">
                <button
                  type="button"
                  onClick={() => handleCompleteRegistration(false)}
                  disabled={loading}
                  className="register-btn-success"
                >
                  {loading ? 'Finishing setup...' : 'Finish Setup'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCompleteRegistration(true)}
                  disabled={loading}
                  className="register-btn-secondary"
                >
                  Skip For Now
                </button>
              </div>
            </div>
          )}

          {/* ── Sign in link ─────────────────────────────────────────── */}
          <div className="register-footer">
            Already have an account?{' '}
            <Link to="/login" className="register-link">Sign in here</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
