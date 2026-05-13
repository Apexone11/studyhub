/* ═══════════════════════════════════════════════════════════════════════════
 * OnboardingProgressBar -- Animated progress fill + step label.
 *
 * Animation is gated on prefers-reduced-motion via `transition: width`
 * — when the user requests reduced motion the width is set instantly
 * (no transition curve, no jump animation) per WCAG 2.3.3.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function OnboardingProgressBar({ currentStep, totalSteps }) {
  const [reduced, setReduced] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event) => setReduced(event.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else if (mq.addListener) mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else if (mq.removeListener) mq.removeListener(handler)
    }
  }, [])

  const safeTotal = Math.max(1, Number(totalSteps) || 1)
  const safeCurrent = Math.min(Math.max(1, Number(currentStep) || 1), safeTotal)
  const pct = Math.round((safeCurrent / safeTotal) * 100)

  return (
    <div style={styles.wrap}>
      <div
        role="progressbar"
        aria-valuenow={safeCurrent}
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-label="Onboarding progress"
        aria-valuetext={`Step ${safeCurrent} of ${safeTotal}`}
        style={styles.track}
      >
        <div
          style={{
            ...styles.fill,
            width: `${pct}%`,
            // reduced-motion → snap to width with no easing
            transition: reduced ? 'none' : 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
      <span style={styles.label}>
        Step {safeCurrent} of {safeTotal}
      </span>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  track: {
    flex: 1,
    height: 6,
    background: 'var(--sh-border)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    background: 'var(--sh-brand)',
    borderRadius: 'var(--radius-full)',
  },
  label: {
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-muted)',
    whiteSpace: 'nowrap',
  },
}
