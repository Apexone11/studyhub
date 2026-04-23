/* ─────────────────────────────────────────────────────────────
 * ConfirmDeleteModal.jsx
 * Confirmation dialog for deleting a conversation
 * ───────────────────────────────────────────────────────────── */
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../../lib/useFocusTrap'
import { PAGE_FONT } from '../../shared/pageUtils'

export function ConfirmDeleteModal({ isOpen, onConfirm, onCancel }) {
  const focusTrapRef = useFocusTrap({ active: isOpen, onClose: onCancel })

  if (!isOpen) return null

  return createPortal(
    <div
      ref={focusTrapRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete conversation"
    >
      <div
        style={{
          width: '90%',
          maxWidth: 380,
          background: 'var(--sh-surface)',
          borderRadius: 'var(--radius-card)',
          padding: 24,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          fontFamily: PAGE_FONT,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>
          Delete Conversation
        </h3>
        <p style={{ fontSize: 13, color: 'var(--sh-text)', marginBottom: 20, lineHeight: 1.5 }}>
          Are you sure? For DMs this will archive the conversation. For groups you will leave the
          group. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'var(--sh-soft)',
              color: 'var(--sh-text)',
              border: '1px solid var(--sh-border)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              background: 'var(--sh-danger)',
              color: 'var(--sh-surface)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
