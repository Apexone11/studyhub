/* ═══════════════════════════════════════════════════════════════════════════
 * StepDone -- Onboarding step 7: You're all set
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const NEXT_STEPS = [
  {
    title: 'Browse your feed',
    description: 'See what your classmates are sharing.',
    path: '/feed',
  },
  {
    title: 'Chat with Hub AI',
    description: 'Get instant help with your courses.',
    path: '/ai',
  },
  {
    title: 'Explore study sheets',
    description: 'Find and star materials for your courses.',
    path: '/sheets',
  },
]

const StepDone = forwardRef(function StepDone({ onNext, submitting }, ref) {
  const navigate = useNavigate()

  // Auto-complete step 7 on mount
  useEffect(() => {
    onNext({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        You are all set
      </h2>
      <p style={styles.subtext}>Your study hub is ready. Here is where to go next.</p>

      <div style={styles.linkGrid}>
        {NEXT_STEPS.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            style={styles.linkCard}
          >
            <span style={styles.linkTitle}>{item.title}</span>
            <span style={styles.linkDesc}>{item.description}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/feed')}
        disabled={submitting}
        style={styles.primaryBtn}
      >
        Explore your dashboard
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
    padding: 'var(--space-4) 0',
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
    lineHeight: 1.5,
    margin: 0,
  },
  linkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'var(--space-3)',
    width: '100%',
    marginTop: 'var(--space-4)',
  },
  linkCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px',
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  },
  linkTitle: {
    fontSize: 'var(--type-sm)',
    fontWeight: 700,
    color: 'var(--sh-brand)',
  },
  linkDesc: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-subtext)',
    lineHeight: 1.4,
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
}

export default StepDone
