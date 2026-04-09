/**
 * StackedEditorPane — vertical editor + preview layout with collapsible panes.
 *
 * Used by:
 *   - SheetLabEditorSurface  (Sheet Lab → Editor tab)
 *   - UploadSheetFormFields  (Upload sheet page → Editor panel)
 *
 * Layout:
 *   ┌────────────────────────────┐
 *   │ [▾] Editor label           │  ← header (clickable to collapse)
 *   ├────────────────────────────┤
 *   │                            │
 *   │   {editor slot}            │  ← expanded content
 *   │                            │
 *   ├────────────────────────────┤
 *   │ [▾] Preview label          │  ← header (clickable to collapse)
 *   ├────────────────────────────┤
 *   │                            │
 *   │   {preview slot}           │  ← expanded content
 *   │                            │
 *   └────────────────────────────┘
 *
 * Why stacked instead of side-by-side: the horizontal split halved available
 * writing width on wide monitors and wrapped unreadably on narrow ones. The
 * stacked layout gives each pane the full page width and lets the author
 * collapse whichever pane they aren't actively looking at.
 *
 * Collapse state is persisted per `storageKey` so the user's preference
 * carries across sessions. If storageKey is omitted, state lives in memory
 * only (useful for throwaway contexts like tests).
 */
import { useCallback, useEffect, useState } from 'react'
import { IconChevronDown } from '../Icons'

const HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: 'var(--sh-soft)',
  borderBottom: '1px solid var(--sh-border)',
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--sh-heading)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  minHeight: 40,
  boxSizing: 'border-box',
}

const CHEVRON_STYLE_BASE = {
  transition: 'transform 0.2s ease',
  color: 'var(--sh-muted)',
  flexShrink: 0,
}

function loadPersistedState(storageKey, defaults) {
  if (!storageKey) return defaults
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      editorCollapsed: Boolean(parsed.editorCollapsed),
      previewCollapsed: Boolean(parsed.previewCollapsed),
    }
  } catch {
    return defaults
  }
}

export default function StackedEditorPane({
  editorLabel = 'Editor',
  previewLabel = 'Preview',
  editor,
  preview,
  editorIcon = null,
  previewIcon = null,
  storageKey = null,
  minEditorHeight = 320,
  minPreviewHeight = 320,
}) {
  const [{ editorCollapsed, previewCollapsed }, setState] = useState(() =>
    loadPersistedState(storageKey, { editorCollapsed: false, previewCollapsed: false }),
  )

  // Persist to localStorage whenever state changes.
  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ editorCollapsed, previewCollapsed }),
      )
    } catch {
      // localStorage may be disabled (private mode, quota) — fail silently.
    }
  }, [storageKey, editorCollapsed, previewCollapsed])

  const toggleEditor = useCallback(() => {
    setState((prev) => {
      // Never collapse both panes at once — that would leave the user with
      // no visible content. If the preview is already collapsed, ignore.
      if (!prev.editorCollapsed && prev.previewCollapsed) return prev
      return { ...prev, editorCollapsed: !prev.editorCollapsed }
    })
  }, [])

  const togglePreview = useCallback(() => {
    setState((prev) => {
      if (!prev.previewCollapsed && prev.editorCollapsed) return prev
      return { ...prev, previewCollapsed: !prev.previewCollapsed }
    })
  }, [])

  const handleKey = (handler) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handler()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-surface)',
      }}
    >
      {/* ─── Editor pane ─── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!editorCollapsed}
        aria-label={`${editorCollapsed ? 'Expand' : 'Collapse'} ${editorLabel}`}
        onClick={toggleEditor}
        onKeyDown={handleKey(toggleEditor)}
        style={HEADER_STYLE}
      >
        <IconChevronDown
          size={14}
          style={{
            ...CHEVRON_STYLE_BASE,
            transform: editorCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        />
        {editorIcon}
        <span>{editorLabel}</span>
      </div>
      {!editorCollapsed ? (
        <div style={{ minHeight: minEditorHeight, display: 'flex', flexDirection: 'column' }}>
          {editor}
        </div>
      ) : null}

      {/* ─── Preview pane ─── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!previewCollapsed}
        aria-label={`${previewCollapsed ? 'Expand' : 'Collapse'} ${previewLabel}`}
        onClick={togglePreview}
        onKeyDown={handleKey(togglePreview)}
        style={{
          ...HEADER_STYLE,
          borderTop: editorCollapsed ? 'none' : '1px solid var(--sh-border)',
        }}
      >
        <IconChevronDown
          size={14}
          style={{
            ...CHEVRON_STYLE_BASE,
            transform: previewCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        />
        {previewIcon}
        <span>{previewLabel}</span>
      </div>
      {!previewCollapsed ? (
        <div style={{ minHeight: minPreviewHeight, display: 'flex', flexDirection: 'column' }}>
          {preview}
        </div>
      ) : null}
    </div>
  )
}
