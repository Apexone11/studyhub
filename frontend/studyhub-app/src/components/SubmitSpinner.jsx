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
 * Respects `prefers-reduced-motion` — animation is gated in CSS.
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function SubmitSpinner({ size = 14, label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-label={label}
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
