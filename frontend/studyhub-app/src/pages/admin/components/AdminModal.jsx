import { useId } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../../lib/useFocusTrap'
import { CloseIcon } from './icons'
import './admin-primitives.css'

/*
 * AdminModal — used by every admin sub-tab.
 *
 * Rebuilt 2026-05-01 (audit Loop 13 finding C2):
 *   - role="dialog" + aria-modal moved from the overlay onto the panel
 *     so screen readers see the panel as the dialog boundary, not the
 *     full-screen backdrop.
 *   - aria-labelledby wired to the visible <h2> via useId so the
 *     dialog's accessible name matches the title.
 *   - useFocusTrap traps Tab + Shift+Tab and handles Escape so admins
 *     navigating with the keyboard can never escape an open dialog.
 *   - createPortal mounts to document.body so animated ancestors with
 *     `transform` don't break `position: fixed` viewport centering.
 */
export default function AdminModal({ open, onClose, title, size = 'md', children, footer }) {
  const titleId = useId()
  const trapRef = useFocusTrap({ active: open, onClose })

  if (!open) return null

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className={`admin-modal admin-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal__header">
          <h2 id={titleId} className="admin-modal__title">
            {title}
          </h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
        {footer && <div className="admin-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
