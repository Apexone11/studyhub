/* ═══════════════════════════════════════════════════════════════════════════
 * OnboardingStepActions -- Shared Back / Skip / Continue button row.
 *
 * Steps render their own primary CTA when its label is dynamic ("Save and
 * continue" vs. "Generate"). For those cases the step renders the primary
 * button itself and passes only the Back + Skip links via this row.
 *
 * Pass `primaryLabel` + `onPrimary` to also render the right-aligned
 * primary button here (default usage).
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function OnboardingStepActions({
  onBack,
  canGoBack,
  onSkip,
  skipLabel = 'Skip for now',
  primaryLabel,
  onPrimary,
  primaryDisabled,
  submitting,
  align = 'center',
}) {
  const showPrimary = typeof primaryLabel === 'string' && typeof onPrimary === 'function'
  return (
    <div
      style={{
        ...styles.row,
        justifyContent: align === 'between' ? 'space-between' : 'center',
      }}
    >
      <div style={styles.left}>
        {canGoBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            style={styles.linkBtn}
            aria-label="Go back to the previous step"
          >
            &lsaquo; Back
          </button>
        ) : null}
        {onSkip ? (
          <button type="button" onClick={onSkip} disabled={submitting} style={styles.linkBtn}>
            {skipLabel}
          </button>
        ) : null}
      </div>
      {showPrimary ? (
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled || submitting}
          style={{
            ...styles.primaryBtn,
            opacity: primaryDisabled || submitting ? 0.5 : 1,
            cursor: primaryDisabled || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : primaryLabel}
        </button>
      ) : null}
    </div>
  )
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
    flexWrap: 'wrap',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
  linkBtn: {
    padding: '6px 12px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    padding: '10px 28px',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    boxShadow: 'var(--sh-btn-primary-shadow)',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
}
