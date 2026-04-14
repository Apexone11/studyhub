/* ═══════════════════════════════════════════════════════════════════════════
 * RegisterScreen.jsx — StudyHub account creation page
 *
 * Two-step flow: Account -> Verify Email -> auto-complete.
 * Google OAuth flow: single-click creation (no extra steps).
 * School/course selection is deferred to /my-courses (post-signup).
 *
 * Design: Direction A — Campus Lab tokens, no inline hex colors.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { fadeInUp } from '../../lib/animations'
import { validateAccountFields, getSteps } from './registerConstants'
import useRegisterFlow from './useRegisterFlow'
import { StepIndicator, AccountStep, VerifyStep } from './RegisterStepFields'
import { API } from '../../config'
import './RegisterScreen.css'

export default function RegisterScreen() {
  const cardRef = useRef(null)
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref')

  const flow = useRegisterFlow({ referralCode: ref || undefined })
  const steps = getSteps()

  /* ── Resolve referral code to inviter info ─────────────────────── */
  const [inviter, setInviter] = useState(null)

  useEffect(() => {
    if (!ref) return
    let active = true
    fetch(`${API}/api/referrals/resolve/${encodeURIComponent(ref)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.valid) setInviter(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [ref])

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
          {/* ── Referral banner ──────────────────────────────────────── */}
          {inviter && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--sh-info-bg, #dbeafe)',
                border: '1px solid var(--sh-info-border, #93c5fd)',
                color: 'var(--sh-info-text, #1e40af)',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              {inviter.inviterAvatarUrl ? (
                <img
                  src={inviter.inviterAvatarUrl}
                  alt=""
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--sh-brand)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {(inviter.inviterUsername || '?')[0].toUpperCase()}
                </div>
              )}
              Invited by {inviter.inviterUsername}
            </div>
          )}

          {/* ── Step indicator ──────────────────────────────────────── */}
          <StepIndicator steps={steps} step={flow.step} />

          {/* ── Error/success messages ──────────────────────────────── */}
          {flow.error && (
            <div role="alert" className="register-alert register-alert--danger">
              {flow.error}
            </div>
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
            <Link to="/login" className="register-link">
              Sign in here
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
