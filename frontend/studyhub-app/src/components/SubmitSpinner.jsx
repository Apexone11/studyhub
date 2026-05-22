/* ═══════════════════════════════════════════════════════════════════════════
 * SubmitSpinner — small inline spinner for submit buttons (P3 form polish)
 *
 * Pair with the "Saving…" or "Signing in…" copy:
 *
 *   <button type="submit" disabled={submitting}>
 *     {submitting && <SubmitSpinner />}
 *     {submitting ? 'Saving…' : 'Save'}
 *   </button>
 *
 * Keyframes (`sh-spin`) are defined in `index.css`.
 *
 * `data-motion="keep"` opts out of the global `prefers-reduced-motion`
 * zero-animation rule in index.css. Per WCAG 2.3.3, motion that
 * conveys essential state (loading in progress) is allowed even under
 * reduced-motion — without rotation a spinner becomes invisible noise.
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function SubmitSpinner({ size = 14, label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-label={label}
      data-motion="keep"
      className="sh-submit-spinner"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        marginRight: 8,
        verticalAlign: '-2px',
        border: '2px solid currentColor',
        borderRightColor: 'transparent',
        borderRadius: '50%',
      }}
    />
  )
}
