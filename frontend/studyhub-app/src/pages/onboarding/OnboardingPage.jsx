/* ═══════════════════════════════════════════════════════════════════════════
 * OnboardingPage -- Guided onboarding flow (7 steps)
 *
 * Thin orchestrator: renders Navbar, progress bar, and the active step.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { Skeleton } from '../../components/Skeleton'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { usePageTitle } from '../../lib/usePageTitle'
import { useOnboardingState } from '../../features/onboarding/useOnboardingState'
import StepWelcome from './StepWelcome'
import StepSchool from './StepSchool'
import StepCourses from './StepCourses'
import StepInterests from './StepInterests'
import StepFirstSuccess from './StepFirstSuccess'
import StepInvite from './StepInvite'
import StepDone from './StepDone'

const TOTAL_STEPS = 7

const STEP_COMPONENTS = {
  1: StepWelcome,
  2: StepSchool,
  3: StepCourses,
  4: StepInterests,
  5: StepFirstSuccess,
  6: StepInvite,
  7: StepDone,
}

export default function OnboardingPage() {
  usePageTitle('Get Started')
  const { status: authStatus } = useProtectedPage()
  const navigate = useNavigate()
  const { state, loading, error, submitting, submitStep, skip } = useOnboardingState()
  const headingRef = useRef(null)
  const prevStepRef = useRef(null)

  const currentStep = state?.currentStep ?? 1

  // Focus heading on step change
  useEffect(() => {
    if (prevStepRef.current !== null && prevStepRef.current !== currentStep) {
      // Small delay to let DOM update
      const timer = setTimeout(() => {
        headingRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
    prevStepRef.current = currentStep
  }, [currentStep])

  // If onboarding is completed or skipped, redirect to feed
  useEffect(() => {
    if (!loading && state && (state.completed || state.skipped)) {
      navigate('/feed', { replace: true })
    }
  }, [loading, state, navigate])

  // If no onboarding state (old user), redirect to feed
  useEffect(() => {
    if (!loading && state === null && !error) {
      navigate('/feed', { replace: true })
    }
  }, [loading, state, error, navigate])

  const handleNext = useCallback(
    (payload) => submitStep(currentStep, payload),
    [submitStep, currentStep],
  )

  const handleSkip = useCallback(() => skip(), [skip])

  if (authStatus === 'loading' || loading) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.container}>
          <div style={styles.card}>
            <Skeleton width="60%" height={28} />
            <Skeleton width="100%" height={16} style={{ marginTop: 16 }} />
            <Skeleton width="80%" height={16} style={{ marginTop: 8 }} />
            <Skeleton width={140} height={40} style={{ marginTop: 24 }} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.container}>
          <div style={styles.card}>
            <h2 style={styles.errorHeading}>Something went wrong</h2>
            <p style={styles.errorMsg}>{error}</p>
            <button type="button" onClick={() => window.location.reload()} style={styles.retryBtn}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!state) return null

  const StepComponent = STEP_COMPONENTS[currentStep]

  return (
    <div style={styles.page}>
      <Navbar />

      <div style={styles.container}>
        {/* Progress bar */}
        <div style={styles.progressWrap}>
          <div
            role="progressbar"
            aria-valuenow={currentStep}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label="Onboarding progress"
            style={styles.progressTrack}
          >
            <div
              style={{
                ...styles.progressFill,
                width: `${(currentStep / TOTAL_STEPS) * 100}%`,
              }}
            />
          </div>
          <span style={styles.progressLabel}>
            Step {currentStep} of {TOTAL_STEPS}
          </span>
        </div>

        {/* Live region for screen readers */}
        <div aria-live="polite" className="sr-only">
          Step {currentStep} of {TOTAL_STEPS}
        </div>

        {/* Step content card */}
        <div style={styles.card}>
          {StepComponent && (
            <StepComponent
              ref={headingRef}
              onNext={handleNext}
              onSkip={handleSkip}
              submitting={submitting}
              progress={state.progress}
            />
          )}
        </div>

        {/* Skip link (hidden on final step) */}
        {currentStep < TOTAL_STEPS && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            style={styles.pageSkipLink}
          >
            Skip setup entirely
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--sh-bg)',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  container: {
    maxWidth: 640,
    margin: '0 auto',
    padding: 'var(--space-8) var(--page-gutter) var(--space-16)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
  },
  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    background: 'var(--sh-border)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--sh-brand)',
    borderRadius: 'var(--radius-full)',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-muted)',
    whiteSpace: 'nowrap',
  },
  card: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--shadow-sm)',
  },
  pageSkipLink: {
    alignSelf: 'center',
    padding: '8px 16px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  errorHeading: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-danger)',
    margin: 0,
  },
  errorMsg: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    marginTop: 'var(--space-2)',
    lineHeight: 1.5,
  },
  retryBtn: {
    marginTop: 'var(--space-4)',
    padding: '8px 24px',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
  },
}
