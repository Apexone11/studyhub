/* ═══════════════════════════════════════════════════════════════════════════
 * StepSelfLearnerGoal -- Onboarding (track=self-learner): optional goal.
 *
 * One-line free text saved to /api/users/me/learning-goal.
 * See docs/roles-and-permissions-plan.md §5.1 step 3.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState } from 'react'
import { API } from '../../config'

const MAX_LENGTH = 500

const StepSelfLearnerGoal = forwardRef(function StepSelfLearnerGoal(
  { onNext, onSkip, submitting },
  ref,
) {
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const trimmed = goal.trim()
    if (!trimmed) {
      onNext({})
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/users/me/learning-goal`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save goal. Try again or skip.')
        return
      }
      onNext({ goal: trimmed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        What do you want to learn this month?
      </h2>
      <p style={styles.subtext}>Optional. We'll show this on your home feed so you stay focused.</p>

      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value.slice(0, MAX_LENGTH))}
        rows={2}
        maxLength={MAX_LENGTH}
        placeholder="e.g. Finish the Python async series by Friday"
        className="sh-input"
        style={styles.textarea}
        aria-label="Learning goal"
      />

      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : null}

      <div style={styles.actions}>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting || saving}
          style={styles.skipLink}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || saving}
          style={styles.primaryBtn}
        >
          {saving ? 'Saving…' : goal.trim() ? 'Save and continue' : 'Continue'}
        </button>
      </div>
    </div>
  )
})

export default StepSelfLearnerGoal

const styles = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' },
  heading: {
    fontSize: 'var(--type-xl)',
    fontWeight: 800,
    color: 'var(--sh-heading)',
    margin: 0,
    outline: 'none',
  },
  subtext: { fontSize: 'var(--type-sm)', color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.5 },
  textarea: {
    width: '100%',
    fontSize: 14,
    resize: 'vertical',
    padding: 12,
    borderRadius: 'var(--radius-control)',
  },
  error: { fontSize: 'var(--type-sm)', color: 'var(--sh-danger-text)', margin: 0 },
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  skipLink: {
    background: 'none',
    border: 'none',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-sm)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  primaryBtn: {
    padding: '10px 24px',
    fontSize: 'var(--type-sm)',
    fontWeight: 700,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
  },
}
