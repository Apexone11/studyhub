import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Navbar from '../../components/Navbar'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { fadeInUp } from '../../lib/animations'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { trackSignupConversion } from '../../lib/telemetry'
import { useSession } from '../../lib/session-context'

const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

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
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

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

function PasswordHint({ password, confirmPassword }) {
  if (!password && !confirmPassword) return null

  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: '1 capital letter', ok: /[A-Z]/.test(password) },
    { label: '1 number', ok: /\d/.test(password) },
    { label: 'Passwords match', ok: password === confirmPassword && confirmPassword.length > 0 },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
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
          {check.ok ? '✓' : '○'} {check.label}
        </div>
      ))}
    </div>
  )
}

function parseTimestampToMs(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatResendCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function RegisterScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { completeAuthentication } = useSession()
  const cardRef = useRef(null)

  const googleState = location.state
  const isGoogleCourseFlow = Boolean(googleState?.googleCourseSelection && googleState?.tempCredential)

  const [step, setStep] = useState(isGoogleCourseFlow ? 'courses' : 'account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(isGoogleCourseFlow ? `Signed in as ${googleState.googleEmail}. Choose your courses to finish setup.` : '')
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [schools, setSchools] = useState([])
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [customCourses, setCustomCourses] = useState([])
  const [customCourseDraft, setCustomCourseDraft] = useState({ code: '', name: '' })
  const [verification, setVerification] = useState(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [clockNowMs, setClockNowMs] = useState(() => Date.now())
  const [googleCredential, setGoogleCredential] = useState(isGoogleCourseFlow ? googleState.tempCredential : null)

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    schoolId: '',
  })

  useEffect(() => {
    if (cardRef.current) fadeInUp(cardRef.current, { duration: 450, y: 20 })
  }, [])

  useEffect(() => {
    if (step !== 'courses' || schools.length > 0 || catalogLoading) return

    let active = true
    setCatalogLoading(true)
    setCatalogError('')

    fetch(`${API}/api/courses/schools`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load the course catalog.')
        }
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

    return () => {
      active = false
    }
  }, [catalogLoading, schools.length, step])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClockNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const selectedSchool = useMemo(
    () => schools.find((school) => String(school.id) === String(form.schoolId)) || null,
    [form.schoolId, schools],
  )

  const availableCourses = selectedSchool?.courses || []

  const resendAvailableAtMs = useMemo(
    () => parseTimestampToMs(verification?.resendAvailableAt),
    [verification?.resendAvailableAt],
  )

  const resendCooldownSeconds = useMemo(() => {
    if (!resendAvailableAtMs) return 0
    return Math.max(0, Math.ceil((resendAvailableAtMs - clockNowMs) / 1000))
  }, [clockNowMs, resendAvailableAtMs])

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
    if (!RULES.email.test(form.email.trim())) {
      return 'Enter a valid email address.'
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

  async function handleStartVerification(event) {
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
        setError(data.error || 'Could not send a verification code.')
        return
      }

      setVerification(data)
      setVerificationCode('')
      setStep('verify')
      setSuccess(`A verification code was sent to ${data.deliveryHint || form.email.trim()}.`)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault()
    if (!verificationCode.trim()) {
      setError('Enter the 6-digit verification code.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API}/api/auth/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationToken: verification?.verificationToken,
          code: verificationCode.trim(),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not verify that code.')
        return
      }

      setVerification((current) => ({ ...current, ...data, verified: true }))
      setStep('courses')
      setSuccess('Email verified. Finish your course setup to create the account.')
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendCode() {
    if (resendCooldownSeconds > 0) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API}/api/auth/register/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationToken: verification?.verificationToken,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not resend the verification code.')
        return
      }

      setVerification((current) => ({ ...current, ...data }))
      setSuccess(`A new verification code was sent to ${data.deliveryHint || form.email.trim()}.`)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

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

      if (data.requiresCourseSelection) {
        setGoogleCredential(data.tempCredential)
        setStep('courses')
        setSuccess(`Signed in as ${data.googleEmail}. Choose your courses to finish setup.`)
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

  async function handleCompleteRegistration(skipCourses = false) {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const isGoogle = Boolean(googleCredential)
      const endpoint = isGoogle ? `${API}/api/auth/google/complete` : `${API}/api/auth/register/complete`

      const body = isGoogle
        ? {
            credential: googleCredential,
            schoolId: skipCourses ? null : (form.schoolId ? Number(form.schoolId) : null),
            courseIds: skipCourses ? [] : selectedCourseIds,
            customCourses: skipCourses ? [] : customCourses,
          }
        : {
            verificationToken: verification?.verificationToken,
            schoolId: skipCourses ? null : (form.schoolId ? Number(form.schoolId) : null),
            courseIds: skipCourses ? [] : selectedCourseIds,
            customCourses: skipCourses ? [] : customCourses,
          }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Could not finish registration.')
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

  const steps = googleCredential
    ? [['courses', 'Courses']]
    : [['account', 'Account'], ['verify', 'Verify'], ['courses', 'Courses']]
  const stepOrder = steps.map(([key]) => key)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#0f172a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Navbar variant="landing" />

      {/* Decorative background */}
      <div style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.08)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -100, width: 350, height: 350, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />

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
          {/* Step indicator */}
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
                      {complete ? '✓' : index + 1}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#0f172a' : '#94a3b8' }}>
                      {label}
                    </span>
                  </div>
                  {/* Progress line */}
                  <div style={{
                    marginTop: 8, height: 3, borderRadius: 999,
                    background: complete || active ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : '#f1f5f9',
                    transition: 'background 0.3s',
                  }} />
                </div>
              )
            })}
          </div>

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

          {step === 'account' && (
            <form onSubmit={handleStartVerification}>
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
                    <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>or sign up with email</span>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e2e8f0, transparent)' }} />
                  </div>
                </>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

                <div>
                  <label htmlFor="register-email" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>Email</label>
                  <input
                    id="register-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setField('email', event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>We'll verify this email</div>
                </div>
              </div>

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

              <PasswordHint password={form.password} confirmPassword={form.confirmPassword} />

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

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                }}
              >
                {loading ? 'Sending code...' : 'Continue To Email Verification'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 52, height: 52, borderRadius: '50%',
                  background: '#eff6ff', border: '2px solid #bfdbfe',
                  marginBottom: 14,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Verify your email</h1>
                <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                  We sent a 6-digit code to <strong>{verification?.deliveryHint || form.email.trim()}</strong>.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="register-verification-code" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  Verification Code
                </label>
                <input
                  id="register-verification-code"
                  value={verificationCode}
                  onChange={(event) => {
                    setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    setError('')
                    setSuccess('')
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  style={{
                    ...inputStyle,
                    letterSpacing: '0.35em', textAlign: 'center', fontSize: 24,
                    padding: '16px',
                  }}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
                <div style={{ marginTop: 5, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>Codes expire after 15 minutes.</div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={loading || verificationCode.trim().length !== 6}
                  style={{
                    padding: '12px 22px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: (loading || verificationCode.trim().length !== 6) ? 'not-allowed' : 'pointer',
                    opacity: (loading || verificationCode.trim().length !== 6) ? 0.7 : 1,
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)',
                  }}
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading || resendCooldownSeconds > 0}
                  style={{
                    padding: '12px 22px', borderRadius: 12,
                    border: '1px solid #e2e8f0', background: '#fff',
                    color: '#475569', fontSize: 14, fontWeight: 700,
                    cursor: (loading || resendCooldownSeconds > 0) ? 'not-allowed' : 'pointer',
                    opacity: (loading || resendCooldownSeconds > 0) ? 0.7 : 1,
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                >
                  {resendCooldownSeconds > 0
                    ? `Resend in ${formatResendCountdown(resendCooldownSeconds)}`
                    : 'Resend Code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('account')
                    setError('')
                    setSuccess('')
                  }}
                  style={{
                    padding: '12px 22px', borderRadius: 12,
                    border: '1px solid #e2e8f0', background: '#fff',
                    color: '#475569', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                >
                  Back
                </button>
              </div>

              {resendCooldownSeconds > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                  You can request another verification code in {formatResendCountdown(resendCooldownSeconds)}.
                </div>
              )}
            </form>
          )}

          {step === 'courses' && (
            <div>
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

              {catalogError && (
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, lineHeight: 1.6 }}>
                  {catalogError}
                </div>
              )}

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
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Skip school selection for now</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              {catalogLoading && (
                <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
                  Loading course catalog...
                </div>
              )}

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
                      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
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
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  {loading ? 'Creating account...' : 'Create Account'}
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
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                >
                  Skip For Now
                </button>
                {!googleCredential && (
                  <button
                    type="button"
                    onClick={() => setStep('verify')}
                    disabled={loading}
                    style={{
                      padding: '13px 24px', borderRadius: 12,
                      border: '1px solid #e2e8f0', background: '#fff',
                      color: '#475569', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    }}
                  >
                    Back
                  </button>
                )}
              </div>
            </div>
          )}

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
