/* ═══════════════════════════════════════════════════════════════════════════
 * AiPermissionDialog — Claude-Code-style "may I do this?" prompt.
 *
 * Rendered by AiPermissionProvider when `requestPermission()` is called.
 * Two buttons: Apply (primary, brand color) and Discard (secondary).
 * If `destructive: true` is passed, Apply becomes red.
 *
 * The dialog blocks UI interaction (modal overlay, focus trap, Esc to
 * reject) so the user has to make a deliberate choice. This matches
 * the Claude Code pattern where every tool use waits for explicit
 * approval.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconSpark } from '../Icons'

export default function AiPermissionDialog({ request, onAccept, onReject }) {
  const containerRef = useRef(null)
  const acceptRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    // Focus the primary button so a quick Enter accepts, Esc rejects.
    // For destructive actions we focus the Reject button instead so
    // accidental Enter doesn't trigger the destructive action.
    const target = request.destructive
      ? containerRef.current?.querySelector('[data-reject]')
      : acceptRef.current
    target?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onReject()
      }
      if (e.key === 'Tab' && containerRef.current) {
        const focusables = containerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    // Body scroll lock while the dialog is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [request.destructive, onReject])

  const applyBg = request.destructive ? 'var(--sh-danger)' : 'var(--sh-brand)'

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-permission-title"
      aria-describedby="ai-permission-summary"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10100,
        padding: 'clamp(12px, 3vw, 20px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onReject()
      }}
    >
      <div
        ref={containerRef}
        style={{
          background: 'var(--sh-surface)',
          color: 'var(--sh-text)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          padding: 20,
          width: 'min(520px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
          display: 'grid',
          gap: 12,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--sh-ai-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <IconSpark size={16} style={{ color: '#fff' }} />
          </div>
          <h2
            id="ai-permission-title"
            style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)' }}
          >
            {request.title}
          </h2>
        </header>

        <p
          id="ai-permission-summary"
          style={{ margin: 0, fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.5 }}
        >
          {request.summary}
        </p>

        {request.preview ? (
          <div
            style={{
              border: '1px solid var(--sh-border)',
              borderRadius: 10,
              background: 'var(--sh-soft)',
              padding: 10,
              maxHeight: 260,
              overflow: 'auto',
              fontSize: 12,
            }}
          >
            {request.preview}
          </div>
        ) : null}

        {request.details ? (
          <dl
            style={{
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 10,
              rowGap: 4,
              fontSize: 11.5,
              color: 'var(--sh-muted)',
            }}
          >
            {Object.entries(request.details).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ fontWeight: 600, textTransform: 'capitalize' }}>{k}:</dt>
                <dd style={{ margin: 0, color: 'var(--sh-text)' }}>{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 4,
            borderTop: '1px solid var(--sh-border)',
            paddingTop: 12,
          }}
        >
          <button
            data-reject
            type="button"
            onClick={onReject}
            style={{
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sh-text)',
              cursor: 'pointer',
              minHeight: 40,
            }}
          >
            {request.rejectLabel}
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={onAccept}
            style={{
              background: applyBg,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 40,
            }}
          >
            {request.applyLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
