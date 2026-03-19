/* ═══════════════════════════════════════════════════════════════════════════
 * RegisterScreen.jsx — StudyHub account creation page
 *
 * Two-step flow: Account -> Courses (no email verification step).
 * Google OAuth flow: Google button -> Courses step (skips account form).
 *
 * Design: Clean Academic Pro — glass-morphism card, gradient indicators,
 * password strength hints, accessible form controls.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Navbar from '../../components/Navbar'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { fadeInUp } from '../../lib/animations'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { trackSignupConversion } from '../../lib/telemetry'
import { useSession } from '../../lib/session-context'

/* ── Validation rules ──────────────────────────────────────────────────── */
const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

/* ── Shared styles ─────────────────────────────────────────────────────── */
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
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

/* ── Input focus/blur handlers ─────────────────────────────────────────── */
function focusInput(e) {
  e.target.style.borderColor = '#3b82f6'
  e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'
  e.target.style.background = '#fff'
}
function blurInput(e) {
  e.target.style.borderColor = '#e2e8f0'
  e.target.style.boxShadow = 'none'
  e.target.style.background = '#f8fafc'
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
    <div className="password-hints-grid" style={{ gap: 8, marginTop: 10 }}>
      {checks.map((check) => (
        <div
          key={check.label}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            background: check.ok ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${check.ok ? '#bbf7d0' : '#e2e8f0'}`,
            fontSize: 12,
            color: check.ok ? '#166534' : '#64748b',
            fontWeight: 600,
          }}
        >
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
  const [pendingLocalUser, setPendingLocalUser] = useState(null)

  /* Form state for account step */
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    schoolId: '',
  })

  /* ── Card entrance animation ───────────────────────────────────────── */
  useEffect(() => {
    if (cardRef.current) fadeInUp(cardRef.current, { duration: 450, y: 20 })
  }, [])

  /* ── Load course catalog when entering courses step ────────────────── */
  useEffect(() => {
    if (step !== 'courses' || schools.length > 0 || catalogLoading) return

    let active = true
    setCatalogLoading(true)
    setCatalogError('')

    fetch(`${API}/api/courses/schools`, {
      headers: { 'Content-Type': 'application/json' },
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
    if (!form.username.trim() || !form.password || !form.confirmPassword) {
      return 'Please fill in all required fields.'
    }
    if (!RULES.username.test(form.username.trim())) {
      return 'Username must be 3-20 characters using letters, numbers, or underscores.'
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

  /* ── Account creation handler (no verification — direct registration) ─ */
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
      const response = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
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

      /* Keep the user on the onboarding route until course setup is finished.
        PublicRoute redirects authenticated users away from /register, so the
        local account flow defers session completion until setup is submitted. */
      setPendingLocalUser(data.user)
      setStep('courses')
      setSuccess('Account created! Now choose your courses, or skip for now.')
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
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Google sign-up failed.')
        return
      }

      /* New Google user — go to course selection */
      if (data.requiresCourseSelection) {
        setGoogleCredential(data.tempCredential)
        setStep('courses')
        setSuccess(`Signed in as ${data.googleName || 'Google user'}. Choose your courses to finish setup.`)
        return
      }

      /* Existing Google user — go to authenticated home */
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
      /* Google flow: call /api/auth/google/complete */
      if (googleCredential) {
        const response = await fetch(`${API}/api/auth/google/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        navigate(getAuthenticatedHomePath(data.user), { replace: true })
        return
      }

      /* Local account: already created in step 1, just save courses via settings */
      if (!skipCourses && (selectedCourseIds.length > 0 || customCourses.length > 0)) {
        const response = await fetch(`${API}/api/settings/courses`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolId: form.schoolId ? Number(form.schoolId) : null,
            courseIds: selectedCourseIds,
            customCourses,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setError(data.error || 'Could not save your courses.')
          return
        }
      }

      /* Navigate to authenticated home */
      if (pendingLocalUser) {
        completeAuthentication(pendingLocalUser)
      }
      trackSignupConversion()
      navigate('/feed', { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step configuration ────────────────────────────────────────────── */
  const steps = googleCredential
    ? [['courses', 'Courses']]
    : [['account', 'Account'], ['courses', 'Courses']]
  const stepOrder = steps.map(([key]) => key)

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

      {/* Decorative background orbs */}
      <div style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.08)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -100, width: 350, height: 350, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      {/* ── Main card ──────────────────────────────────────────────── */}
      <div ref={cardRef} style={{ padding: '48px 20px 80px', display: 'grid', placeItems: 'center', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            width: 'min(92vw, 580px)',
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(20px)',
            borderRadius: 24,
            border: '1px solid rgba(226, 232, 240, 0.8)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            padding: '40px 36px',
          }}
        >
          {/* ── Step indicator ──────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {steps.map(([key, label], index) => {
              const currentIndex = stepOrder.indexOf(step)
              const thisIndex = stepOrder.indexOf(key)
              const complete = thisIndex < currentIndex
              const active = key === step

              return (
                <div key={key} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: active || complete ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#f1f5f9',
                        color: active || complete ? '#fff' : '#94a3b8',
                        display: 'grid', placeItems: 'center',
                        fontSize: 13, fontWeight: 700,
                        boxShadow: active ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      {complete ? '\u2713' : index + 1}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#0f172a' : '#94a3b8' }}>
                      {label}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    marginTop: 8, height: 3, borderRadius: 999,
                    background: complete || active ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : '#f1f5f9',
                    transition: 'background 0.3s',
                  }} />
                </div>
              )
            })}
          </div>

          {/* ── Error/success messages ──────────────────────────────── */}
          {error && (
            <div style={{
              marginBottom: 16, padding: '12px 14px', borderRadius: 12,
              border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c',
              fontSize: 13, lineHeight: 1.6,
            }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              marginBottom: 16, padding: '12px 14px', borderRadius: 12,
              border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534',
              fontSize: 13, lineHeight: 1.6,
            }}>
              {success}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
           * STEP 1: Account Creation
           * ══════════════════════════════════════════════════════════ */}
          {step === 'account' && (
            <form onSubmit={handleCreateAccount}>
              {/* Logo + heading */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 52, height: 52, borderRadius: 14,
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)',
                  marginBottom: 14,
                }}>
                  <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
                    <path d="M18 6 L18 30 M10 14 L18 6 L26 14 M10 22 L18 14 L26 22" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Create your account</h1>
                <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                  Join thousands of students studying smarter together.
                </p>
              </div>

              {/* Google Sign-Up button */}
              {GOOGLE_CLIENT_ID && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #e2e8f0)' }} />
                    <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>or create an account</span>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e2e8f0, transparent)' }} />
                  </div>
                </>
              )}

              {/* Username (full width) */}
              <div>
                <label htmlFor="register-username" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>Username</label>
                <input
                  id="register-username"
                  value={form.username}
                  onChange={(event) => setField('username', event.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  style={inputStyle}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
                <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>3-20 chars, letters/numbers/_</div>
              </div>

              {/* Password + Confirm row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                <div>
                  <label htmlFor="register-password" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>Password</label>
                  <input
                    id="register-password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setField('password', event.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>

                <div>
                  <label htmlFor="register-confirm-password" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>Confirm Password</label>
                  <input
                    id="register-confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setField('confirmPassword', event.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
              </div>

              {/* Password strength hints */}
              <PasswordHint password={form.password} confirmPassword={form.confirmPassword} />

              {/* Terms checkbox */}
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  fontSize: 13, color: '#64748b', lineHeight: 1.7,
                  marginTop: 18, marginBottom: 20,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(event) => setField('termsAccepted', event.target.checked)}
                  style={{ marginTop: 3, accentColor: '#3b82f6' }}
                />
                <span>
                  I agree to the <Link to="/terms">Terms of Use</Link> and <Link to="/guidelines">Community Guidelines</Link>.
                </span>
              </label>

              {/* Submit button */}
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
                }}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════
           * STEP 2: Course Selection
           * ══════════════════════════════════════════════════════════ */}
          {step === 'courses' && (
            <div>
              {/* Heading */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 52, height: 52, borderRadius: '50%',
                  background: '#f0fdf4', border: '2px solid #bbf7d0',
                  marginBottom: 14,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </div>
                <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Choose your courses</h1>
                <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                  Add your school and courses, or skip and set up later.
                </p>
              </div>

              {/* Catalog error */}
              {catalogError && (
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, lineHeight: 1.6 }}>
                  {catalogError}
                </div>
              )}

              {/* School selector */}
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="register-school" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>School</label>
                <select
                  id="register-school"
                  value={form.schoolId}
                  onChange={(event) => {
                    setField('schoolId', event.target.value)
                    setSelectedCourseIds([])
                    setCustomCourses([])
                  }}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Skip school selection for now</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Loading state */}
              {catalogLoading && (
                <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
                  Loading course catalog...
                </div>
              )}

              {/* Course checkboxes */}
              {selectedSchool && availableCourses.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                    Course Catalog
                  </div>
                  <div style={{
                    maxHeight: 220, overflowY: 'auto',
                    border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc',
                  }}>
                    {availableCourses.map((course) => {
                      const checked = selectedCourseIds.includes(course.id)
                      return (
                        <label
                          key={course.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '12px 14px', borderBottom: '1px solid #e2e8f0',
                            background: checked ? '#eff6ff' : 'transparent',
                            cursor: 'pointer', transition: 'background 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCourse(course.id)}
                            style={{ accentColor: '#3b82f6' }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{course.code}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{course.name}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Custom course input */}
              <div style={{
                marginBottom: 18, padding: '14px', borderRadius: 14,
                border: '1px dashed #cbd5e1', background: '#f8fafc',
              }}>
                <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  Add a custom course
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8 }}>
                  <input
                    value={customCourseDraft.code}
                    onChange={(event) => setCustomCourseDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    placeholder="Code"
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <input
                    value={customCourseDraft.name}
                    onChange={(event) => setCustomCourseDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Course name"
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <button
                    type="button"
                    onClick={addCustomCourse}
                    style={{
                      padding: '12px 18px', borderRadius: 12,
                      border: '1px solid #e2e8f0', background: '#fff',
                      color: '#475569', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                  >
                    Add
                  </button>
                </div>
                {customCourses.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {customCourses.map((course) => (
                      <span
                        key={course.code}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 999,
                          background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                          color: '#1d4ed8', fontSize: 12, fontWeight: 700,
                        }}
                      >
                        {course.code}
                        <button
                          type="button"
                          onClick={() => setCustomCourses((current) => current.filter((item) => item.code !== course.code))}
                          style={{
                            background: 'none', border: 'none', color: '#1d4ed8',
                            cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1,
                          }}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleCompleteRegistration(false)}
                  disabled={loading}
                  style={{
                    padding: '13px 24px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    fontFamily: FONT,
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  {loading ? 'Finishing setup...' : 'Finish Setup'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCompleteRegistration(true)}
                  disabled={loading}
                  style={{
                    padding: '13px 24px', borderRadius: 12,
                    border: '1px solid #e2e8f0', background: '#fff',
                    color: '#475569', fontSize: 14, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    fontFamily: FONT,
                  }}
                >
                  Skip For Now
                </button>
              </div>
            </div>
          )}

          {/* ── Sign in link ─────────────────────────────────────────── */}
          <div style={{
            marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9',
            textAlign: 'center', fontSize: 14, color: '#64748b',
          }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#3b82f6', fontWeight: 700, textDecoration: 'none' }}>
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
