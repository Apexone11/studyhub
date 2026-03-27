/* ═══════════════════════════════════════════════════════════════════════════
 * KeyboardShortcuts.jsx — Global keyboard shortcuts help modal
 *
 * Opens on "?" key press. Shows all available keyboard shortcuts
 * grouped by category. Closes on Escape or backdrop click.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'

const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')
const mod = isMac ? '⌘' : 'Ctrl'

const SHORTCUT_GROUPS = [
  {
    title: 'General',
    shortcuts: [
      { label: 'Open search', keys: [mod, 'K'] },
      { label: 'Show keyboard shortcuts', keys: ['?'] },
    ],
  },
  {
    title: 'Search Modal',
    shortcuts: [
      { label: 'Navigate results', keys: ['↑', '↓'] },
      { label: 'Open selected result', keys: ['Enter'] },
      { label: 'Close search', keys: ['Esc'] },
    ],
  },
  {
    title: 'Dialogs & Modals',
    shortcuts: [
      { label: 'Close dialog', keys: ['Esc'] },
    ],
  },
]

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e) {
      // Don't trigger when typing in inputs
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="sh-shortcuts-overlay" onClick={() => setOpen(false)} role="presentation">
      <div className="sh-shortcuts-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <h2>Keyboard Shortcuts</h2>
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title} className="sh-shortcut-group">
            <div className="sh-shortcut-group-title">{group.title}</div>
            {group.shortcuts.map((s) => (
              <div key={s.label} className="sh-shortcut-row">
                <span className="sh-shortcut-label">{s.label}</span>
                <span className="sh-shortcut-keys">
                  {s.keys.map((k, i) => (
                    <kbd key={i}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--sh-slate-400, #94a3b8)', textAlign: 'center', marginTop: 8 }}>
          Press <kbd style={{ fontSize: 10, background: 'var(--sh-slate-100, #f1f5f9)', border: '1px solid var(--sh-slate-200, #e2e8f0)', borderRadius: 4, padding: '1px 5px' }}>?</kbd> or <kbd style={{ fontSize: 10, background: 'var(--sh-slate-100, #f1f5f9)', border: '1px solid var(--sh-slate-200, #e2e8f0)', borderRadius: 4, padding: '1px 5px' }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}
