/* ═══════════════════════════════════════════════════════════════════════════
 * RegisterScreen.jsx — StudyHub account creation page
 *
 * Two-step flow: Account -> Verify Email -> auto-complete.
 * Google OAuth flow: single-click creation (no extra steps).
 * School/course selection is deferred to /my-courses (post-signup).
 *
 * Design: Direction A — Campus Lab tokens, no inline hex colors.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { fadeInUp } from '../../lib/animations'
import { validateAccountFields, getSteps } from './registerConstants'
import useRegisterFlow from './useRegisterFlow'
import { StepIndicator, AccountStep, VerifyStep } from './RegisterStepFields'
import './RegisterScreen.css'

export default function RegisterScreen() {
  const cardRef = useRef(null)

  const flow = useRegisterFlow()
  const steps = getSteps()

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
    <div className="register-page sh-public-page sh-public-page--auth">
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
