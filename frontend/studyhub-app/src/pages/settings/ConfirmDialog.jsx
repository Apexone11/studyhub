import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { Button } from './settingsShared'
import { FONT } from './settingsState'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  busy = false,
}) {
  // Trap Tab + Shift+Tab inside the dialog so keyboard focus can't
  // wander to background controls. Escape still dismisses via
  // onCancel (the standard dialog close path) — focus trap and
  // dismissal are separate concerns. (Audit Loop 13 finding C4.)
  const trapRef = useFocusTrap({ active: open, onClose: onCancel })

  if (!open) return null
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        fontFamily: FONT,
      }}
      onClick={onCancel}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          padding: 22,
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 17, color: 'var(--sh-heading)' }}>{title}</h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            secondary
            disabled={busy}
            onClick={onCancel}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            {cancelLabel}
          </Button>
          <Button
            danger={danger}
            disabled={busy}
            onClick={onConfirm}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            {busy ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
