/* ═══════════════════════════════════════════════════════════════════════════
 * OnboardingResumePrompt -- Inline prompt nudging skipped users back to
 * an unfinished onboarding step.
 *
 * Renders only when:
 *   1. The user has onboarding state, AND
 *   2. Their state is skipped (not completed), AND
 *   3. The step they need to reach (`needStep`) is still ahead of them.
 *
 * Otherwise renders nothing so it's safe to drop into any page header.
 *
 * Example usage from the sheet-upload page (when the user has zero
 * enrolled courses):
 *
 *   <OnboardingResumePrompt
 *     needStep={3}
 *     message="Set up your courses first — it takes 30 seconds."
 *   />
 *
 * Clicking "Resume setup" deep-links to /onboarding?step=N which the
 * OnboardingPage interprets as a Back-navigation override.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../config'

export default function OnboardingResumePrompt({
  needStep,
  message = 'Finish onboarding to unlock this — it takes about 30 seconds.',
  ctaLabel = 'Resume setup',
}) {
  const [state, setState] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/api/onboarding/state`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        setState(data?.state || null)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded || dismissed) return null
  if (!state) return null
  if (state.completed) return null
  // If the user already advanced past the step we're nudging them to,
  // no further prompt is needed.
  if (typeof needStep === 'number' && state.currentStep > needStep) return null
  // We only nudge if the user hit "Skip" earlier — if they're mid-flow
  // the redirect-to-onboarding logic in useOnboardingRedirect handles it.
  if (!state.skipped) return null

  const target = typeof needStep === 'number' ? `/onboarding?step=${needStep}` : '/onboarding'

  return (
    <section
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--sh-info-bg)',
        border: '1px solid var(--sh-info-border)',
        borderRadius: 12,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--sh-info-text, var(--sh-heading))',
            marginBottom: 2,
          }}
        >
          One quick step left
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--sh-subtext)',
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      </div>
      <Link
        to={target}
        style={{
          background: 'var(--sh-brand)',
          color: 'var(--sh-btn-primary-text)',
          border: 'none',
          borderRadius: 8,
          padding: '7px 14px',
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {ctaLabel}
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss onboarding resume prompt"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--sh-muted)',
          fontSize: 18,
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        &times;
      </button>
    </section>
  )
}
