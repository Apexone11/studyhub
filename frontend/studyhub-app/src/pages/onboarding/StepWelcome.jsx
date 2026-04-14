/* ═══════════════════════════════════════════════════════════════════════════
 * StepWelcome -- Onboarding step 1: Welcome screen
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef } from 'react'

const StepWelcome = forwardRef(function StepWelcome({ onNext, onSkip, submitting }, ref) {
  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        Welcome to StudyHub
      </h2>
      <p style={styles.subtext}>Let&apos;s get you set up in 2 minutes. You can skip any time.</p>

      <button
        type="button"
        onClick={() => onNext({})}
        disabled={submitting}
        style={styles.primaryBtn}
      >
        {submitting ? 'Starting...' : 'Get started'}
      </button>

      <button type="button" onClick={onSkip} disabled={submitting} style={styles.skipLink}>
        Skip for now
      </button>
    </div>
  )
})

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-8) 0',
  },
  heading: {
    fontSize: 'var(--type-xl)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    outline: 'none',
    margin: 0,
  },
  subtext: {
    fontSize: 'var(--type-base)',
    color: 'var(--sh-subtext)',
    maxWidth: 420,
    lineHeight: 1.6,
    margin: 0,
  },
  primaryBtn: {
    marginTop: 'var(--space-4)',
    padding: '12px 36px',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    boxShadow: 'var(--sh-btn-primary-shadow)',
    transition: 'opacity 0.15s',
  },
  skipLink: {
    padding: '8px 16px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}

export default StepWelcome
