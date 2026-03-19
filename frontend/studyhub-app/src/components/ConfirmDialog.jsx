import { useEffect, useRef } from 'react'

/**
 * Reusable confirmation dialog that replaces window.confirm().
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
  const confirmRef = useRef(null)

  // Focus the confirm button on open and trap Escape
  useEffect(() => {
    if (!open) return
    setTimeout(() => confirmRef.current?.focus(), 50)

    function onKey(e) {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <div style={styles.overlay} onClick={onCancel} role="presentation">
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title" style={styles.title}>{title}</h3>
        {message && <p style={styles.message}>{message}</p>}
        <div style={styles.actions}>
          <button onClick={onCancel} style={styles.cancelBtn}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              ...styles.confirmBtn,
              background: isDanger ? '#ef4444' : '#3b82f6',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    backdropFilter: 'blur(3px)',
    zIndex: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  modal: {
    background: '#fff',
    borderRadius: 18,
    padding: 'clamp(20px, 3vw, 28px)',
    width: 'min(420px, 90vw)',
    boxShadow: '0 16px 48px rgba(15, 23, 42, 0.2)',
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1.3,
  },
  message: {
    margin: '10px 0 0',
    fontSize: 14,
    color: '#475569',
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
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#475569',
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
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.12s',
  },
}
