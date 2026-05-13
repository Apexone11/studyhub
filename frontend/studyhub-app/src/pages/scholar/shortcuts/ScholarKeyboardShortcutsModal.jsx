/**
 * ScholarKeyboardShortcutsModal — overlay listing every Scholar
 * keyboard shortcut.
 *
 * Pair with `useScholarShortcuts` — the hook does the bindings, this
 * modal documents them. Open via `?` (handled by the hook) or any
 * caller-supplied trigger.
 *
 * Layout: three logical sections (Navigation / Actions / Reading),
 * rendered as separate two-column key/action tables. Keys render in a
 * monospace `<kbd>` element with `var(--sh-soft)` background per the
 * StudyHub modal language.
 *
 * The hint pill (rendered separately via `createPortal` so it stays at
 * the bottom-right of the viewport) reminds the user that `?` opens
 * this modal. Dismissable, dismissal persists in localStorage so the
 * hint doesn't badger returning readers.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import FocusTrappedDialog from '../../../components/Modal/FocusTrappedDialog'

const HINT_DISMISS_KEY = 'studyhub.scholar.shortcutsHintDismissed'

const SECTIONS = [
  {
    title: 'Navigation',
    items: [
      { keys: ['?'], label: 'Open this shortcuts overlay' },
      { keys: ['/'], label: 'Focus the search input' },
      { keys: ['Ctrl', 'K'], altKeys: ['Cmd', 'K'], label: 'Focus the search input' },
      { keys: ['j'], label: 'Next result' },
      { keys: ['k'], label: 'Previous result' },
      { keys: ['Esc'], label: 'Close current overlay' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { keys: ['s'], label: 'Save paper to shelf' },
      { keys: ['a'], label: 'Add annotation' },
      { keys: ['c'], label: 'Open cite dialog' },
      { keys: ['g'], label: 'Generate a study sheet' },
    ],
  },
  {
    title: 'Reading',
    items: [{ keys: ['r'], label: 'Toggle reading mode' }],
  },
]

const TITLE_ID = 'scholar-shortcuts-modal-title'

function Kbd({ children }) {
  return (
    <kbd
      style={{
        fontFamily:
          'ui-monospace, "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", monospace',
        background: 'var(--sh-soft)',
        color: 'var(--sh-text)',
        border: '1px solid var(--sh-border)',
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: 1.4,
        minWidth: 22,
        textAlign: 'center',
        display: 'inline-block',
        boxShadow: '0 1px 0 var(--sh-border)',
      }}
    >
      {children}
    </kbd>
  )
}

function KeyCombo({ keys }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Kbd>{k}</Kbd>
          {i < keys.length - 1 ? (
            <span aria-hidden="true" style={{ color: 'var(--sh-text-muted)', fontSize: 12 }}>
              +
            </span>
          ) : null}
        </span>
      ))}
    </span>
  )
}

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function ScholarKeyboardShortcutsModal({ open, onClose }) {
  return (
    <FocusTrappedDialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={TITLE_ID}
      panelStyle={{
        maxWidth: 560,
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2
          id={TITLE_ID}
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--sh-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shortcuts overlay"
          style={{
            background: 'transparent',
            border: '1px solid var(--sh-border)',
            color: 'var(--sh-text)',
            borderRadius: 8,
            minWidth: 44,
            minHeight: 44,
            padding: '0 12px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Close
        </button>
      </div>

      <p
        style={{
          margin: 0,
          color: 'var(--sh-text-muted)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Shortcuts are disabled while you&apos;re typing in a text field.
      </p>

      <div style={{ display: 'grid', gap: 18 }}>
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            aria-labelledby={`scholar-shortcuts-section-${section.title}`}
          >
            <h3
              id={`scholar-shortcuts-section-${section.title}`}
              style={{
                margin: '0 0 8px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--sh-text-muted)',
              }}
            >
              {section.title}
            </h3>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--sh-text-muted)',
                      padding: '4px 0',
                      width: '40%',
                    }}
                  >
                    Key
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--sh-text-muted)',
                      padding: '4px 0',
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, idx) => (
                  <tr
                    key={`${section.title}-${idx}`}
                    style={{ borderTop: '1px solid var(--sh-border)' }}
                  >
                    <td style={{ padding: '8px 0' }}>
                      <KeyCombo keys={item.keys} />
                      {item.altKeys ? (
                        <>
                          <span
                            aria-hidden="true"
                            style={{
                              margin: '0 8px',
                              color: 'var(--sh-text-muted)',
                              fontSize: 12,
                            }}
                          >
                            or
                          </span>
                          <KeyCombo keys={item.altKeys} />
                        </>
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: 13,
                        color: 'var(--sh-text)',
                      }}
                    >
                      {item.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </FocusTrappedDialog>
  )
}

/**
 * Persistent bottom-right hint pill. Renders via `createPortal` so it
 * isn't trapped inside transformed ancestors. Dismissed state lives in
 * localStorage; an `onOpen` click both invokes the callback and hides
 * the hint for the session.
 *
 * @param {{ onOpen: () => void }} props
 */
export function ScholarShortcutsHint({ onOpen }) {
  // Lazy initializer reads localStorage once on first render; avoids
  // the useEffect+setState pattern that the React Compiler flags as
  // a synchronous cascading render.
  const [hidden, setHidden] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem(HINT_DISMISS_KEY) === 'true'
    } catch {
      return false
    }
  })

  if (hidden) return null
  if (typeof document === 'undefined') return null

  const dismiss = () => {
    setHidden(true)
    try {
      window.localStorage.setItem(HINT_DISMISS_KEY, 'true')
    } catch {
      /* private mode — fine, hint just re-appears next session */
    }
  }

  return createPortal(
    <div
      // Position fixed bottom-right but raised above the safe-area
      // inset so it isn't clipped on iOS PWAs.
      style={{
        position: 'fixed',
        right: 'max(16px, env(safe-area-inset-right))',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 900,
        display: 'inline-flex',
        gap: 8,
        alignItems: 'center',
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 999,
        padding: '6px 10px 6px 14px',
        boxShadow: 'var(--shadow-md, 0 2px 12px rgba(0,0,0,0.08))',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (typeof onOpen === 'function') onOpen()
        }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          color: 'var(--sh-text)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          minHeight: 32,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
        }}
      >
        Press{' '}
        <kbd
          style={{
            fontFamily:
              'ui-monospace, "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", monospace',
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 11,
            color: 'var(--sh-text)',
          }}
        >
          ?
        </kbd>{' '}
        for shortcuts
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss shortcut hint"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--sh-text-muted)',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          minWidth: 44,
          minHeight: 44,
          padding: '0 4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>,
    document.body,
  )
}
