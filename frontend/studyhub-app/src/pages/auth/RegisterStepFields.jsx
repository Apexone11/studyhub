/* ═══════════════════════════════════════════════════════════════════════════
 * RegisterStepFields.jsx — Individual step/form-field components
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { GOOGLE_CLIENT_ID } from '../../config'
import CourseListPicker from '../../components/CourseListPicker'

/* ── Password strength indicator ───────────────────────────────────────── */
export function PasswordHint({ password, confirmPassword }) {
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

/* ── Step indicator bar ────────────────────────────────────────────────── */
export function StepIndicator({ steps, step }) {
  const stepOrder = steps.map(([key]) => key)

  return (
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
  )
}

/* ══════════════════════════════════════════════════════════════════════════
 * STEP 1: Account Creation
 * ══════════════════════════════════════════════════════════════════════════ */
export function AccountStep({ form, setField, loading, onSubmit, onGoogleSuccess, setError }) {
  return (
    <form onSubmit={onSubmit}>
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
              onSuccess={onGoogleSuccess}
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
  )
}

/* ══════════════════════════════════════════════════════════════════════════
 * STEP 2: Email Verification
 * ══════════════════════════════════════════════════════════════════════════ */
export function VerifyStep({ verificationCode, setVerificationCode, deliveryHint, loading, resendCountdown, onSubmit, onResend, setError }) {
  return (
    <form onSubmit={onSubmit}>
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
          <button type="button" disabled={loading} onClick={onResend} className="register-btn-ghost">
            Resend code
          </button>
        )}
      </div>

      <div className="register-center-text" style={{ marginTop: 12 }}>
        Check your spam folder if you don&apos;t see it. Code expires in 15 minutes.
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
 * STEP 3: Course Selection
 * ══════════════════════════════════════════════════════════════════════════ */
export function CoursesStep({
  form, setField, loading, schools, catalogLoading, catalogError,
  selectedSchool, availableCourses, selectedCourseIds, toggleCourse,
  customCourses, customCourseDraft, setCustomCourseDraft, setCustomCourses,
  addCustomCourse, onComplete, setCatalogError, setSchools,
  setSelectedCourseIds,
}) {
  return (
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
          onClick={() => onComplete(false)}
          disabled={loading}
          className="register-btn-success"
        >
          {loading ? 'Finishing setup...' : 'Finish Setup'}
        </button>
        <button
          type="button"
          onClick={() => onComplete(true)}
          disabled={loading}
          className="register-btn-secondary"
        >
          Skip For Now
        </button>
      </div>
    </div>
  )
}
