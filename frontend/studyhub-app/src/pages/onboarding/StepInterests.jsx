/* ═══════════════════════════════════════════════════════════════════════════
 * StepInterests -- Onboarding step 4: What are you looking for?
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState } from 'react'

const INTEREST_OPTIONS = [
  { value: 'exam_prep', label: 'Exam prep' },
  { value: 'note_sharing', label: 'Note sharing' },
  { value: 'group_study', label: 'Group study' },
  { value: 'research', label: 'Research' },
  { value: 'tutoring', label: 'Tutoring' },
]

const StepInterests = forwardRef(function StepInterests({ onNext, onSkip, submitting }, ref) {
  const [selected, setSelected] = useState([])

  function toggle(value) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  function handleSubmit() {
    onNext({ tags: selected })
  }

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        What are you looking for?
      </h2>
      <p style={styles.subtext}>
        This helps us personalize your feed. Optional -- skip if you are not sure.
      </p>

      <div style={styles.pillGrid} role="group" aria-label="Interest options">
        {INTEREST_OPTIONS.map((opt) => {
          const isActive = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              aria-pressed={isActive}
              style={{
                ...styles.pill,
                background: isActive ? 'var(--sh-brand)' : 'var(--sh-surface)',
                color: isActive ? 'var(--sh-btn-primary-text)' : 'var(--sh-text)',
                borderColor: isActive ? 'var(--sh-brand)' : 'var(--sh-border)',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div style={styles.actions}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.length === 0 || submitting}
          style={{
            ...styles.primaryBtn,
            opacity: selected.length === 0 || submitting ? 0.5 : 1,
          }}
        >
          {submitting ? 'Saving...' : 'Next'}
        </button>
        <button type="button" onClick={onSkip} disabled={submitting} style={styles.skipLink}>
          Skip this step
        </button>
      </div>
    </div>
  )
})

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  heading: {
    fontSize: 'var(--type-lg)',
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
  pillGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) 0',
  },
  pill: {
    padding: '10px 20px',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    border: '1.5px solid',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
  },
  primaryBtn: {
    padding: '10px 32px',
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
    padding: '6px 12px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}

export default StepInterests
