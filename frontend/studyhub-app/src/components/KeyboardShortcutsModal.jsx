/* ═══════════════════════════════════════════════════════════════════════════
 * KeyboardShortcutsModal.jsx — Industry-standard `?` help panel
 *
 * Mounted globally at the App root and toggled via the
 * `studyhub:shortcuts:toggle` window event, which `useGlobalShortcuts`
 * dispatches when the user presses `?` (Shift+/) outside an editable
 * field. Mirrors the GitHub / Linear / Slack convention so users who
 * already know the keyboard-shortcut idiom find it immediately.
 *
 * Accessibility:
 *   - role="dialog" + aria-modal="true" + aria-labelledby on the title
 *   - Focus trap (Tab/Shift+Tab cycle inside the panel, restore on close)
 *   - Escape closes
 *   - Body scroll locked while open (via useFocusTrap)
 *   - Respects `prefers-reduced-motion` for the entrance animation
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../lib/useFocusTrap'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

const GENERAL_SHORTCUTS = [
  { keys: ['?'], label: 'Open this help panel' },
  { keys: ['g', 'h'], label: 'Go to Feed' },
  { keys: ['g', 's'], label: 'Go to Sheets' },
  { keys: ['g', 'n'], label: 'Go to Notes' },
  { keys: ['g', 'm'], label: 'Go to Messages' },
  { keys: ['g', 'a'], label: 'Go to Hub AI' },
]

const COMPOSER_SHORTCUTS = [
  { keys: ['Cmd/Ctrl', 'Enter'], label: 'Submit composer' },
  { keys: ['Esc'], label: 'Cancel / close' },
]

const LIST_SHORTCUTS = [
  { keys: ['j'], label: 'Next item' },
  { keys: ['k'], label: 'Previous item' },
  { keys: ['/'], label: 'Focus search' },
]

function getInitialReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function usePrefersReducedMotion() {
  // Lazy initializer reads the media query once at mount so the first
  // render already has the correct value — avoids the
  // setState-in-effect lint rule that fires when an effect immediately
  // calls setState to seed state from an external source.
  const [reduced, setReduced] = useState(getInitialReducedMotion)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event) => setReduced(event.matches)
    if (mql.addEventListener) {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    // Safari < 14 fallback
    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])
  return reduced
}

function Kbd({ children }) {
  return <kbd style={styles.kbd}>{children}</kbd>
}

function ShortcutRow({ keys, label }) {
  return (
    <li style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={styles.keyGroup}>
        {keys.map((key, idx) => (
          <span key={`${key}-${idx}`} style={styles.keyWrapper}>
            <Kbd>{key}</Kbd>
            {idx < keys.length - 1 ? <span style={styles.then}>then</span> : null}
          </span>
        ))}
      </span>
    </li>
  )
}

function ShortcutSection({ title, items }) {
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <ul style={styles.list}>
        {items.map((item) => (
          <ShortcutRow key={item.label} keys={item.keys} label={item.label} />
        ))}
      </ul>
    </section>
  )
}

export default function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const handleClose = useCallback(() => setOpen(false), [])

  const trapRef = useFocusTrap({ active: open, onClose: handleClose })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    function onToggle() {
      setOpen((prev) => !prev)
    }
    function onOpen() {
      setOpen(true)
    }
    function onClose() {
      setOpen(false)
    }
    window.addEventListener('studyhub:shortcuts:toggle', onToggle)
    window.addEventListener('studyhub:shortcuts:open', onOpen)
    window.addEventListener('studyhub:shortcuts:close', onClose)
    return () => {
      window.removeEventListener('studyhub:shortcuts:toggle', onToggle)
      window.removeEventListener('studyhub:shortcuts:open', onOpen)
      window.removeEventListener('studyhub:shortcuts:close', onClose)
    }
  }, [])

  const modalStyle = useMemo(
    () => ({
      ...styles.modal,
      animation: reducedMotion ? 'none' : 'sh-kbd-modal-in 140ms ease-out',
    }),
    [reducedMotion],
  )

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div style={styles.overlay} onClick={handleClose} role="presentation">
      <style>{KEYFRAMES}</style>
      <div
        ref={trapRef}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sh-kbd-modal-title"
        aria-describedby="sh-kbd-modal-desc"
      >
        <header style={styles.header}>
          <div>
            <h2 id="sh-kbd-modal-title" style={styles.title}>
              Keyboard shortcuts
            </h2>
            <p id="sh-kbd-modal-desc" style={styles.subtitle}>
              Move around StudyHub faster. Press <Kbd>?</Kbd> any time to open this panel.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={styles.closeBtn}
            aria-label="Close keyboard shortcuts"
          >
            &#x2715;
          </button>
        </header>

        <div style={styles.columns}>
          <ShortcutSection title="General" items={GENERAL_SHORTCUTS} />
          <div style={styles.rightCol}>
            <ShortcutSection title="Composer" items={COMPOSER_SHORTCUTS} />
            <ShortcutSection title="Lists" items={LIST_SHORTCUTS} />
          </div>
        </div>

        <footer style={styles.footer}>
          <span style={styles.footerHint}>
            Shortcuts are disabled while typing in inputs or text areas.
          </span>
          <button type="button" onClick={handleClose} style={styles.doneBtn}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

const KEYFRAMES = `
@keyframes sh-kbd-modal-in {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
`

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(4px)',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(12px, 3vw, 32px)',
    fontFamily: FONT,
  },
  modal: {
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    border: '1px solid var(--sh-border)',
    borderRadius: 18,
    width: 'min(720px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
    padding: 'clamp(20px, 3vw, 28px)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: 'var(--sh-subtext)',
    lineHeight: 1.5,
  },
  closeBtn: {
    flexShrink: 0,
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-muted)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
    alignItems: 'flex-start',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  section: {
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  sectionTitle: {
    margin: '0 0 10px',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--sh-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 13,
    color: 'var(--sh-text)',
  },
  label: {
    color: 'var(--sh-text)',
    lineHeight: 1.4,
  },
  keyGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  keyWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  then: {
    fontSize: 11,
    color: 'var(--sh-muted)',
    fontWeight: 600,
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
    height: 22,
    padding: '0 6px',
    borderRadius: 6,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 11,
    fontWeight: 700,
    boxShadow: '0 1px 0 rgba(15, 23, 42, 0.08)',
  },
  footer: {
    marginTop: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  footerHint: {
    fontSize: 12,
    color: 'var(--sh-muted)',
    lineHeight: 1.4,
  },
  doneBtn: {
    padding: '8px 16px',
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
