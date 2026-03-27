/* ═══════════════════════════════════════════════════════════════════════════
 * ActionBlockedModal.jsx — Shown when a restricted user attempts an action
 *
 * Props:
 *  open      — boolean
 *  reason    — optional server-provided restriction reason
 *  onClose   — callback to dismiss
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function ActionBlockedModal({ open, reason, onClose }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div style={styles.iconWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sh-danger-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>

        <h3 style={styles.title}>Action restricted</h3>
        <p style={styles.message}>
          Your account is currently restricted and you cannot perform this action.
        </p>

        {reason && (
          <div style={styles.reasonBox}>
            <strong style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--sh-muted)' }}>
              Reason
            </strong>
            {reason}
          </div>
        )}

        <p style={styles.hint}>
          You can view your moderation status and submit an appeal from your settings.
        </p>

        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.cancelBtn}>
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => { onClose?.(); navigate('/settings?tab=moderation') }}
            style={styles.primaryBtn}
          >
            View moderation status
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
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(4px)',
    zIndex: 550,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT,
  },
  modal: {
    background: 'var(--sh-surface)',
    borderRadius: 18,
    border: '1px solid var(--sh-border)',
    padding: 'clamp(20px, 3vw, 28px)',
    width: 'min(420px, 90vw)',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
    textAlign: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'var(--sh-danger-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--sh-heading)',
  },
  message: {
    margin: '0 0 12px',
    fontSize: 13,
    color: 'var(--sh-subtext)',
    lineHeight: 1.55,
  },
  reasonBox: {
    margin: '0 0 12px',
    padding: '10px 14px',
    borderRadius: 10,
    background: 'var(--sh-danger-bg)',
    border: '1px solid var(--sh-danger-border)',
    color: 'var(--sh-danger-text)',
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: 'left',
  },
  hint: {
    margin: '0 0 16px',
    fontSize: 12,
    color: 'var(--sh-muted)',
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: 10,
  },
  cancelBtn: {
    padding: '9px 18px',
    borderRadius: 10,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-muted)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT,
  },
  primaryBtn: {
    padding: '9px 18px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--sh-brand)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  },
}
