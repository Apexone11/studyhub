/* ═══════════════════════════════════════════════════════════════════════════
 * AiSlashCommandMenu.jsx — Slash-command popover for the Hub AI composer.
 *
 * Triggered by a literal `/` at the start of the textarea. Implements the
 * ARIA combobox pattern (L4-CRIT-2):
 *   - parent textarea wears role="combobox" + aria-expanded + aria-controls
 *     + aria-autocomplete="list" + aria-activedescendant
 *   - menu container: role="listbox" id="slash-listbox"
 *   - each option: role="option" id="slash-opt-{i}" aria-selected
 *
 * Slash commands are CLIENT-SIDE — selecting one expands into a full prompt
 * template the parent then sends. Per L1-MED-2 and L1-MED-5, v1 ships 7
 * commands: summarize, quiz, explain, outline (replaces flashcards),
 * cite, translate, define.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { filterCommands } from './aiSlashCommands'

/**
 * @param {{
 *   open: boolean,
 *   trigger: string | null,
 *   activeIdx: number,
 *   onActiveIdxChange: (i: number) => void,
 *   onSelect: (cmd: { name: string, template: string }) => void,
 * }} props
 */
export default function AiSlashCommandMenu({
  open,
  trigger,
  activeIdx,
  onActiveIdxChange,
  onSelect,
}) {
  const listRef = useRef(null)
  const items = filterCommands(trigger)

  // Keep the active item visible inside the scroll container.
  useEffect(() => {
    if (!open) return
    const container = listRef.current
    if (!container) return
    const node = container.querySelector(`#slash-opt-${activeIdx}`)
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx, open])

  if (!open || items.length === 0) return null

  return (
    <div
      ref={listRef}
      id="slash-listbox"
      role="listbox"
      aria-label="Slash commands"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        // L17-HIGH-3 sibling fix: clamp to viewport width.
        width: 'min(320px, calc(100vw - 32px))',
        maxHeight: 'min(280px, calc(100vh - 140px))',
        overflowY: 'auto',
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-md)',
        padding: 6,
        zIndex: 30,
      }}
    >
      {items.map((cmd, i) => {
        const isActive = i === activeIdx
        return (
          <button
            key={cmd.name}
            id={`slash-opt-${i}`}
            role="option"
            aria-selected={isActive}
            type="button"
            onMouseEnter={() => onActiveIdxChange(i)}
            onClick={() => onSelect(cmd)}
            style={{
              width: '100%',
              display: 'block',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 8,
              background: isActive ? 'var(--sh-brand-soft)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? 'var(--sh-pill-text)' : 'var(--sh-text)',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 2,
                color: isActive ? 'var(--sh-pill-text)' : 'var(--sh-heading)',
              }}
            >
              {cmd.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--sh-subtext)',
                lineHeight: 1.4,
              }}
            >
              {cmd.description}
            </div>
          </button>
        )
      })}
    </div>
  )
}
