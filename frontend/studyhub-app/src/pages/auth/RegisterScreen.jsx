import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { API } from '../../config'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { trackSignupConversion } from '../../lib/telemetry'
import { useSession } from '../../lib/session-context'

const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

function StageCard({ children }) {
  return (
    <div
      style={{
        width: 'min(92vw, 620px)',
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

function Field({ label, children, hint, htmlFor }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ marginTop: 5, fontSize: 12, color: '#94a3b8' }}>
          {hint}
        </div>
      )}
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
    tone === 'success'
      ? { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' }
      : tone === 'info'
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

function PasswordHint({ password, confirmPassword }) {
  if (!password && !confirmPassword) return null

  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: '1 capital letter', ok: /[A-Z]/.test(password) },
    { label: '1 number', ok: /\d/.test(password) },
    { label: 'Passwords match', ok: password === confirmPassword && confirmPassword.length > 0 },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
        marginTop: 10,
      }}
    >
      {checks.map((check) => (
        <div
          key={check.label}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: check.ok ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${check.ok ? '#bbf7d0' : '#e2e8f0'}`,
            fontSize: 12,
            color: check.ok ? '#166534' : '#64748b',
          }}
        >
          {check.ok ? '✓' : '○'} {check.label}
        </div>
      ))}
    </div>
  )
}

export default function RegisterScreen() {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()

  const [step, setStep] = useState('account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [schools, setSchools] = useState([])
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [customCourses, setCustomCourses] = useState([])
  const [customCourseDraft, setCustomCourseDraft] = useState({ code: '', name: '' })
  const [verification, setVerification] = useState(null)
  const [verificationCode, setVerificationCode] = useState('')

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    schoolId: '',
  })

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

  const selectedSchool = useMemo(
    () => schools.find((school) => String(school.id) === String(form.schoolId)) || null,
    [form.schoolId, schools],
  )

  const availableCourses = selectedSchool?.courses || []

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

  async function handleCompleteRegistration(skipCourses = false) {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API}/api/auth/register/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationToken: verification?.verificationToken,
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
        <StageCard>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[
              ['account', 'Account'],
              ['verify', 'Verify Email'],
              ['courses', 'Courses'],
            ].map(([key, label], index) => {
              const order = ['account', 'verify', 'courses']
              const currentIndex = order.indexOf(step)
              const thisIndex = order.indexOf(key)
              const complete = thisIndex < currentIndex
              const active = key === step

              return (
                <div key={key} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: active || complete ? '#3b82f6' : '#e2e8f0',
                        color: active || complete ? '#fff' : '#64748b',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {complete ? '✓' : index + 1}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#0f172a' : '#64748b' }}>
                      {label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {error && <Message>{error}</Message>}
          {success && <Message tone="success">{success}</Message>}

          {step === 'account' && (
            <form onSubmit={handleStartVerification}>
              <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Create your account</h1>
              <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                Email is required now. We’ll send a verification code before course selection and account creation.
              </p>

              <Field label="Username" htmlFor="register-username" hint="3-20 characters. Letters, numbers, and underscores only.">
                <Input
                  id="register-username"
                  value={form.username}
                  onChange={(event) => setField('username', event.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                />
              </Field>

              <Field label="Email" htmlFor="register-email" hint="This email will receive your verification code and future account recovery emails.">
                <Input
                  id="register-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>

              <Field label="Password" htmlFor="register-password">
                <Input
                  id="register-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setField('password', event.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
              </Field>

              <Field label="Confirm Password" htmlFor="register-confirm-password">
                <Input
                  id="register-confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setField('confirmPassword', event.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                />
                <PasswordHint password={form.password} confirmPassword={form.confirmPassword} />
              </Field>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  color: '#64748b',
                  lineHeight: 1.7,
                  marginBottom: 24,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(event) => setField('termsAccepted', event.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  I agree to the <Link to="/terms">Terms of Use</Link> and <Link to="/guidelines">Community Guidelines</Link>.
                  I understand that verified email is required before I can finish registering.
                </span>
              </label>

              <Button type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Sending code…' : 'Continue To Email Verification'}
              </Button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode}>
              <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Verify your email</h1>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                We sent a 6-digit code to <strong>{verification?.deliveryHint || form.email.trim()}</strong>.
                Enter it here before you choose courses and create the account.
              </p>

              <Field label="Verification Code" htmlFor="register-verification-code" hint="Codes expire after 15 minutes.">
                <Input
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
                  style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22 }}
                  autoFocus
                />
              </Field>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button type="submit" disabled={loading || verificationCode.trim().length !== 6}>
                  {loading ? 'Verifying…' : 'Verify Code'}
                </Button>
                <Button type="button" secondary onClick={handleResendCode} disabled={loading}>
                  Resend Code
                </Button>
                <Button
                  type="button"
                  secondary
                  onClick={() => {
                    setStep('account')
                    setError('')
                    setSuccess('')
                  }}
                >
                  Back
                </Button>
              </div>
            </form>
          )}

          {step === 'courses' && (
            <div>
              <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Choose your courses</h1>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                Your email is verified. Add your school and courses now, or skip and finish later from settings.
              </p>

              {catalogError && <Message tone="info">{catalogError}</Message>}

              <Field label="School" htmlFor="register-school">
                <select
                  id="register-school"
                  value={form.schoolId}
                  onChange={(event) => {
                    setField('schoolId', event.target.value)
                    setSelectedCourseIds([])
                    setCustomCourses([])
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    color: '#0f172a',
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                >
                  <option value="">Skip school selection for now</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </Field>

              {catalogLoading && (
                <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
                  Loading course catalog…
                </div>
              )}

              {selectedSchool && availableCourses.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                    Course Catalog
                  </div>
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      background: '#f8fafc',
                    }}
                  >
                    {availableCourses.map((course) => {
                      const checked = selectedCourseIds.includes(course.id)
                      return (
                        <label
                          key={course.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '12px 14px',
                            borderBottom: '1px solid #e2e8f0',
                            background: checked ? '#eff6ff' : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCourse(course.id)}
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

              <div
                style={{
                  marginBottom: 18,
                  padding: '14px',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                  background: '#f8fafc',
                }}
              >
                <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  Add a custom course
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8 }}>
                  <Input
                    value={customCourseDraft.code}
                    onChange={(event) => setCustomCourseDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    placeholder="Code"
                  />
                  <Input
                    value={customCourseDraft.name}
                    onChange={(event) => setCustomCourseDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Course name"
                  />
                  <Button type="button" secondary onClick={addCustomCourse}>
                    Add
                  </Button>
                </div>
                {customCourses.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {customCourses.map((course) => (
                      <span
                        key={course.code}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {course.code}
                        <button
                          type="button"
                          onClick={() => setCustomCourses((current) => current.filter((item) => item.code !== course.code))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 12,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button type="button" onClick={() => handleCompleteRegistration(false)} disabled={loading}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </Button>
                <Button type="button" secondary onClick={() => handleCompleteRegistration(true)} disabled={loading}>
                  Skip For Now
                </Button>
                <Button type="button" secondary onClick={() => setStep('verify')} disabled={loading}>
                  Back
                </Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            Already have an account? <Link to="/login">Sign in here</Link>
          </div>
        </StageCard>
      </div>
    </div>
  )
}
