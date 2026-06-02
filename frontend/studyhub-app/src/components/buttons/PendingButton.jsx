/* ═══════════════════════════════════════════════════════════════════════════
 * PendingButton — async-aware button with built-in spinner + disabled state
 *
 * Wraps a native <button> so callers don't have to wire spinner + disabled
 * + aria-busy + double-click-prevention by hand on every async action.
 * Pair with `useAsyncAction` for full ergonomics, or call directly with
 * a `pending` prop driven by local useState.
 *
 *   <PendingButton pending={saving} onClick={handleSave}>Save</PendingButton>
 *   <PendingButton pending={saving} pendingLabel="Saving…" onClick={...}>Save</PendingButton>
 *
 * Reuses the existing SubmitSpinner glyph (CSS keyframes already gated on
 * prefers-reduced-motion in index.css). When `pendingLabel` is omitted the
 * children stay visible alongside the spinner — useful for icon-only buttons.
 * ═══════════════════════════════════════════════════════════════════════════ */
import SubmitSpinner from '../SubmitSpinner'

export default function PendingButton({
  pending = false,
  pendingLabel = null,
  disabled = false,
  type = 'button',
  className,
  style,
  spinnerSize = 14,
  children,
  ...rest
}) {
  const isDisabled = pending || disabled
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      className={className}
      style={style}
      {...rest}
    >
      {pending ? <SubmitSpinner size={spinnerSize} label={pendingLabel || 'Working'} /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}
