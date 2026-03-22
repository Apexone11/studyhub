/* ═══════════════════════════════════════════════════════════════════════════
 * RegisterScreen.jsx — StudyHub account creation page
 *
 * Three-step flow: Account -> Verify Email -> Courses.
 * Google OAuth flow: Google button -> Courses step (skips account form + verification).
 *
 * Design: Direction A — Campus Lab tokens, no inline hex colors.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { fadeInUp } from '../../lib/animations'
import { validateAccountFields, getSteps } from './registerConstants'
import useRegisterFlow from './useRegisterFlow'
import { StepIndicator, AccountStep, VerifyStep, CoursesStep } from './RegisterStepFields'
import './RegisterScreen.css'

export default function RegisterScreen() {
  const cardRef = useRef(null)

  const flow = useRegisterFlow()
  const steps = getSteps(flow.googleCredential)

  /* ── Card entrance animation ───────────────────────────────────────── */
  useEffect(() => {
    if (cardRef.current) fadeInUp(cardRef.current, { duration: 450, y: 20 })
  }, [])

  /* ── Account creation wrapper (validates then delegates to hook) ───── */
  function handleCreateAccount(event) {
    const validationError = validateAccountFields(flow.form)
    flow.handleCreateAccount(event, validationError)
  }

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
          <StepIndicator steps={steps} step={flow.step} />

          {/* ── Error/success messages ──────────────────────────────── */}
          {flow.error && (
            <div role="alert" className="register-alert register-alert--danger">{flow.error}</div>
          )}
          {flow.success && (
            <div className="register-alert register-alert--success">{flow.success}</div>
          )}

          {/* ── Step 1: Account Creation ──────────────────────────── */}
          {flow.step === 'account' && (
            <AccountStep
              form={flow.form}
              setField={flow.setField}
              loading={flow.loading}
              onSubmit={handleCreateAccount}
              onGoogleSuccess={flow.handleGoogleSuccess}
              setError={flow.setError}
            />
          )}

          {/* ── Step 2: Email Verification ────────────────────────── */}
          {flow.step === 'verify' && (
            <VerifyStep
              verificationCode={flow.verificationCode}
              setVerificationCode={flow.setVerificationCode}
              deliveryHint={flow.deliveryHint}
              loading={flow.loading}
              resendCountdown={flow.resendCountdown}
              onSubmit={flow.handleVerifyCode}
              onResend={flow.handleResendCode}
              setError={flow.setError}
            />
          )}

          {/* ── Step 3: Course Selection ──────────────────────────── */}
          {flow.step === 'courses' && (
            <CoursesStep
              form={flow.form}
              setField={flow.setField}
              loading={flow.loading}
              schools={flow.schools}
              catalogLoading={flow.catalogLoading}
              catalogError={flow.catalogError}
              selectedSchool={flow.selectedSchool}
              availableCourses={flow.availableCourses}
              selectedCourseIds={flow.selectedCourseIds}
              setSelectedCourseIds={flow.setSelectedCourseIds}
              toggleCourse={flow.toggleCourse}
              customCourses={flow.customCourses}
              customCourseDraft={flow.customCourseDraft}
              setCustomCourseDraft={flow.setCustomCourseDraft}
              setCustomCourses={flow.setCustomCourses}
              addCustomCourse={flow.addCustomCourse}
              onComplete={flow.handleCompleteRegistration}
              setCatalogError={flow.setCatalogError}
              setSchools={flow.setSchools}
            />
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
