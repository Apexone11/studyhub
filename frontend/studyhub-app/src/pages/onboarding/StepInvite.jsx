/* ═══════════════════════════════════════════════════════════════════════════
 * StepInvite -- Onboarding step 6: Invite your classmates
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState } from 'react'

const EMAIL_SLOTS = 3

const StepInvite = forwardRef(function StepInvite({ onNext, onSkip, submitting }, ref) {
  const [emails, setEmails] = useState(Array.from({ length: EMAIL_SLOTS }, () => ''))

  function updateEmail(index, value) {
    setEmails((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const validEmails = emails.filter((e) => e.trim().length > 0 && e.includes('@'))

  function handleSubmit() {
    onNext({ emails: validEmails })
  }

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        Invite your classmates
      </h2>
      <p style={styles.subtext}>Study is better together. You can always do this later.</p>

      <div style={styles.inputGroup}>
        {emails.map((email, i) => (
          <div key={i}>
            <label htmlFor={`invite-email-${i}`} className="sr-only">
              Classmate email {i + 1}
            </label>
            <input
              id={`invite-email-${i}`}
              type="email"
              placeholder={`classmate${i + 1}@school.edu`}
              value={email}
              onChange={(e) => updateEmail(i, e.target.value)}
              style={styles.input}
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      <div style={styles.comingSoon}>Invites are coming soon. For now, skip this step.</div>

      <div style={styles.actions}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled
          title="Coming soon"
          style={{ ...styles.primaryBtn, opacity: 0.5, cursor: 'not-allowed' }}
        >
          Send invites
        </button>
        <button type="button" onClick={onSkip} disabled={submitting} style={styles.skipLink}>
          Skip for now
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
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-input-text)',
    background: 'var(--sh-input-bg)',
    border: '1px solid var(--sh-input-border)',
    borderRadius: 'var(--radius-control)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  comingSoon: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-warning-text)',
    background: 'var(--sh-warning-bg)',
    border: '1px solid var(--sh-warning-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 14px',
    textAlign: 'center',
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

export default StepInvite
