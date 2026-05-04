/* ═══════════════════════════════════════════════════════════════════════════
 * AiMentionMenu.jsx — @-mention popover for the Hub AI composer.
 *
 * Triggered by `@` followed by 0+ word characters at the cursor. v1 ships
 * three sections: My sheets, My notes, My courses (per L1-MED-3 the
 * `@paper:` and `@user:` namespaces are reserved/disabled v1).
 *
 * Same ARIA combobox pattern as AiSlashCommandMenu:
 *   - parent textarea wears role="combobox" + aria-expanded + aria-controls
 *     + aria-autocomplete="list" + aria-activedescendant
 *   - menu container: role="listbox" id="mention-listbox"
 *   - each option: role="option" id="mention-opt-{i}" aria-selected
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { API } from '../../config'

/**
 * @param {{
 *   open: boolean,
 *   trigger: string | null,
 *   activeIdx: number,
 *   onActiveIdxChange: (i: number) => void,
 *   onSelect: (item: { kind: 'sheet' | 'note' | 'course', id: number, name: string }) => void,
 *   courses?: Array<{ id: number, code?: string, name: string }>,
 * }} props
 */
function AiMentionMenuImpl(
  { open, trigger, activeIdx, onActiveIdxChange, onSelect, courses = [] },
  ref,
) {
  const [sheets, setSheets] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  // Strip the leading `@` for the search query the API expects.
  const q = (trigger || '').replace(/^@/, '').trim()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const ctrl = new AbortController()
    setLoading(true)

    Promise.all([
      fetch(`${API}/api/search?type=sheets&scope=mine&limit=6&q=${encodeURIComponent(q)}`, {
        credentials: 'include',
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { results: { sheets: [] } }))
        .catch(() => ({ results: { sheets: [] } })),
      fetch(`${API}/api/search?type=notes&scope=mine&limit=6&q=${encodeURIComponent(q)}`, {
        credentials: 'include',
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { results: { notes: [] } }))
        .catch(() => ({ results: { notes: [] } })),
    ])
      .then(([sRes, nRes]) => {
        if (cancelled) return
        setSheets(sRes?.results?.sheets || [])
        setNotes(nRes?.results?.notes || [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [open, q])

  // Flat list of options for keyboard nav. Course list is filtered client-
  // side because session courses are already in memory.
  const options = useMemo(() => {
    const filteredCourses = q
      ? courses.filter((c) => {
          const txt = `${c.code || ''} ${c.name || ''}`.toLowerCase()
          return txt.includes(q.toLowerCase())
        })
      : courses
    return [
      ...sheets.map((s) => ({ kind: 'sheet', id: s.id, name: s.title || 'Untitled sheet' })),
      ...notes.map((n) => ({ kind: 'note', id: n.id, name: n.title || 'Untitled note' })),
      ...filteredCourses.map((c) => ({
        kind: 'course',
        id: c.id,
        name: c.code ? `${c.code} — ${c.name}` : c.name,
      })),
    ]
  }, [sheets, notes, courses, q])

  // L4-F1: parent presses Tab/Enter — call confirmActive() to commit the
  // currently-highlighted item (mirrors slash menu confirm-on-Tab/Enter).
  useImperativeHandle(
    ref,
    () => ({
      confirmActive() {
        if (!open || options.length === 0) return false
        const idx = Math.max(0, Math.min(activeIdx, options.length - 1))
        const item = options[idx]
        if (item) {
          onSelect(item)
          return true
        }
        return false
      },
      optionCount: () => options.length,
    }),
    [open, options, activeIdx, onSelect],
  )

  // Keep active item scrolled into view.
  useEffect(() => {
    if (!open) return
    const container = listRef.current
    if (!container) return
    const node = container.querySelector(`#mention-opt-${activeIdx}`)
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx, open])

  if (!open) return null

  const sectionLabelStyle = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--sh-subtext)',
    padding: '8px 10px 4px',
  }

  let cursor = 0
  const renderRow = (item) => {
    const idx = cursor++
    const isActive = idx === activeIdx
    return (
      <button
        key={`${item.kind}-${item.id}`}
        id={`mention-opt-${idx}`}
        role="option"
        aria-selected={isActive}
        type="button"
        onMouseEnter={() => onActiveIdxChange(idx)}
        onClick={() => onSelect(item)}
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
          fontSize: 13,
        }}
      >
        {item.name}
      </button>
    )
  }

  return (
    <div
      ref={listRef}
      id="mention-listbox"
      role="listbox"
      aria-label="Mentions"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        // L17-HIGH-3: clamp to viewport width so the 360px popover doesn't
        // cause horizontal scroll on 320px viewports.
        width: 'min(360px, calc(100vw - 32px))',
        maxHeight: 'min(320px, calc(100vh - 140px))',
        overflowY: 'auto',
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-md)',
        padding: 4,
        zIndex: 30,
      }}
    >
      {loading && options.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--sh-subtext)' }}>
          Searching your content…
        </div>
      ) : null}

      {sheets.length > 0 ? (
        <>
          <div style={sectionLabelStyle}>My sheets</div>
          {sheets.map((s) =>
            renderRow({ kind: 'sheet', id: s.id, name: s.title || 'Untitled sheet' }),
          )}
        </>
      ) : null}

      {notes.length > 0 ? (
        <>
          <div style={sectionLabelStyle}>My notes</div>
          {notes.map((n) =>
            renderRow({ kind: 'note', id: n.id, name: n.title || 'Untitled note' }),
          )}
        </>
      ) : null}

      {courses.length > 0 ? (
        <>
          <div style={sectionLabelStyle}>My courses</div>
          {(q
            ? courses.filter((c) =>
                `${c.code || ''} ${c.name || ''}`.toLowerCase().includes(q.toLowerCase()),
              )
            : courses
          ).map((c) =>
            renderRow({
              kind: 'course',
              id: c.id,
              name: c.code ? `${c.code} — ${c.name}` : c.name,
            }),
          )}
        </>
      ) : null}

      {!loading && options.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--sh-subtext)' }}>
          No matches. Try @sheet, @note, or @course.
        </div>
      ) : null}
    </div>
  )
}

const AiMentionMenu = forwardRef(AiMentionMenuImpl)
AiMentionMenu.displayName = 'AiMentionMenu'
export default AiMentionMenu
