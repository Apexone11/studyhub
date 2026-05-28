/**
 * ConfirmDialog — reusable confirmation dialog that replaces
 * `window.confirm()`. Returns null when closed; renders a focus-trapped
 * alertdialog otherwise.
 *
 * 2026-05-27 — migrated from bespoke `createPortal` + `useFocusTrap` to
 * the shared `<FocusTrappedDialog>` primitive (modal-focus-trap
 * migration). Behaviour preserved:
 *   - role="alertdialog" (urgent confirm/cancel semantic per W3C APG)
 *   - Initial focus on the Confirm button (legacy behaviour). For new
 *     destructive flows, prefer routing through useAiPermission which
 *     focuses Reject instead (CLAUDE.md "Universal AI permission
 *     framework").
 *   - Escape closes via onCancel.
 *   - Backdrop click closes via onCancel.
 *
 * Props:
 *  open          — boolean, whether to show the dialog
 *  title         — heading text
 *  message       — body text (string or React node)
 *  confirmLabel  — text for the confirm button (default: "Confirm")
 *  cancelLabel   — text for the cancel button (default: "Cancel")
 *  variant       — "danger" | "default" (default: "default")
 *  onConfirm     — callback when user confirms
 *  onCancel      — callback when user cancels / dismisses
 */
import FocusTrappedDialog from './Modal/FocusTrappedDialog'

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}) {
  const isDanger = variant === 'danger'

  return (
    <FocusTrappedDialog
      open={open}
      onClose={onCancel}
      role="alertdialog"
      ariaLabelledBy="confirm-dialog-title"
      // Initial focus on Confirm. Pre-existing behaviour — see component
      // docblock for the "destructive flows should land on Cancel"
      // caveat and the recommended useAiPermission route.
      initialFocusSelector="[data-autofocus]"
      mobileLayout="centered"
      overlayStyle={styles.overlay}
      panelStyle={styles.modal}
    >
      <h3 id="confirm-dialog-title" style={styles.title}>
        {title}
      </h3>
      {message && <p style={styles.message}>{message}</p>}
      <div style={styles.actions}>
        <button onClick={onCancel} style={styles.cancelBtn}>
          {cancelLabel}
        </button>
        <button
          data-autofocus
          onClick={onConfirm}
          style={{
            ...styles.confirmBtn,
            background: isDanger ? 'var(--sh-danger)' : 'var(--sh-info)',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </FocusTrappedDialog>
  )
}

const styles = {
  overlay: {
    background: 'var(--sh-overlay, rgba(15, 23, 42, 0.5))',
    backdropFilter: 'blur(3px)',
    zIndex: 600,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  modal: {
    background: 'var(--sh-surface, #fff)',
    borderRadius: 18,
    padding: 'clamp(20px, 3vw, 28px)',
    width: 'min(420px, 90vw)',
    maxWidth: 'min(420px, 90vw)',
    boxShadow: '0 16px 48px rgba(15, 23, 42, 0.2)',
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--sh-slate-900, #0f172a)',
    lineHeight: 1.3,
  },
  message: {
    margin: '10px 0 0',
    fontSize: 14,
    color: 'var(--sh-slate-600, #475569)',
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    padding: '9px 18px',
    borderRadius: 10,
    border: '1px solid var(--sh-slate-200, #e2e8f0)',
    background: 'var(--sh-surface, #fff)',
    color: 'var(--sh-slate-600, #475569)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.12s',
  },
  confirmBtn: {
    padding: '9px 18px',
    borderRadius: 10,
    border: 'none',
    color: 'var(--sh-surface, #fff)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.12s',
  },
}
