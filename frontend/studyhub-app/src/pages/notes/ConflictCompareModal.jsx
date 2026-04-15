import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { diffWordsWithSpace } from 'diff'

export default function ConflictCompareModal({
  yours,
  current,
  onClose,
  onKeepMine,
  onTakeTheirs,
}) {
  const parts = useMemo(
    () => diffWordsWithSpace(current?.content ?? '', yours?.content ?? ''),
    [current?.content, yours?.content],
  )

  return createPortal(
    <div style={backdrop} onClick={onClose} data-testid="conflict-compare-modal">
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={header}>
          <strong>Conflict - your changes vs. server</strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            x
          </button>
        </header>
        <section style={{ padding: 12, color: 'var(--sh-slate-600)', fontSize: 12 }}>
          Red = on server. Green = your local edit.
        </section>
        <section style={{ padding: 16, overflow: 'auto', flex: 1, whiteSpace: 'pre-wrap' }}>
          {parts.map((p, i) => (
            <span
              key={i}
              style={
                p.added
                  ? { background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' }
                  : p.removed
                    ? {
                        background: 'var(--sh-danger-bg)',
                        color: 'var(--sh-danger-text)',
                        textDecoration: 'line-through',
                      }
                    : {}
              }
            >
              {p.value}
            </span>
          ))}
        </section>
        <footer style={footer}>
          <button type="button" onClick={onTakeTheirs} style={secondaryBtn}>
            Use theirs
          </button>
          <button type="button" onClick={onKeepMine} style={primaryBtn}>
            Keep mine
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

const backdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}
const modal = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-slate-800)',
  width: 'min(900px, 90vw)',
  height: 'min(80vh, 700px)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,.2)',
}
const header = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderBottom: '1px solid var(--sh-border)',
}
const footer = {
  padding: 12,
  borderTop: '1px solid var(--sh-border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}
const closeBtn = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  cursor: 'pointer',
}
const primaryBtn = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--sh-primary)',
  color: '#ffffff',
}
const secondaryBtn = {
  padding: '6px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  background: 'var(--sh-surface)',
  color: 'var(--sh-slate-800)',
  border: '1px solid var(--sh-border)',
}
