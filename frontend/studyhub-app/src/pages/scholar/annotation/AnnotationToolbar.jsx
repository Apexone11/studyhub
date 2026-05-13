/**
 * AnnotationToolbar.jsx — Selection-floating mini-toolbar for highlight
 * + note + cite + visibility quick-set.
 *
 * Behaviour:
 *  - Desktop: floats over the user's text selection. Positioned above the
 *    selection unless within 60px of the viewport top — then below.
 *  - Mobile (≤ 767px): pins to the bottom of the viewport as a horizontal
 *    bar with `safe-area-inset-bottom` padding. The native selection
 *    handles already collide with a floating bubble on phones, so we
 *    don't follow the selection on touch.
 *  - Click-outside closes (caller un-mounts via `onClose` callback).
 *
 * Prop contract (preserved + extended):
 *   position           { top, left }   selection anchor in viewport coords.
 *                                       Null on mobile (bottom-pinned).
 *   activeColor        string          one of HIGHLIGHT_COLORS.
 *   onColorChange      (color) => void cycle / pick a highlight color.
 *   onSave             () => void      legacy save trigger (kept for
 *                                       compatibility with existing
 *                                       ScholarPaperPage wiring).
 *   onClose            () => void      close (caller un-mounts).
 *   onCite             (selection) =>  forward selection to a cite flow.
 *                       void
 *   paperId            string          optional — when present, "Save
 *                                       note" POSTs through the
 *                                       annotations API.
 *   selection          string          captured selection text (for the
 *                                       cite callback).
 *   anchor             object          backend `anchor` payload for the
 *                                       selection (range coords).
 *
 * a11y:
 *  - role="toolbar" + aria-label
 *  - 44×44px minimum touch targets per WCAG 2.5.5
 *  - prefers-reduced-motion honoured (no transition when reduced)
 *  - Visibility dropdown is keyboard-operable (button + menu pattern)
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import { authHeaders } from '../../shared/pageUtils'
import useReducedMotion from '../../../lib/useReducedMotion'
import useBottomSheetOnMobile from '../../../lib/useBottomSheetOnMobile'

const HIGHLIGHT_COLORS = ['yellow', 'green', 'pink', 'blue']

const COLOR_HEX = {
  yellow: '#facc15',
  green: '#34d399',
  pink: '#f472b6',
  blue: '#60a5fa',
}

const VISIBILITY_OPTIONS = [
  { id: 'private', label: 'Private' },
  { id: 'school', label: 'School' },
  { id: 'public', label: 'Public' },
]

const TOOLBAR_HEIGHT = 44
const VIEWPORT_TOP_THRESHOLD = 60

export default function AnnotationToolbar({
  position,
  activeColor = 'yellow',
  onColorChange,
  onSave,
  onClose,
  onCite,
  paperId,
  selection = '',
  anchor = null,
}) {
  const reducedMotion = useReducedMotion()
  const { isMobile } = useBottomSheetOnMobile({ onDismiss: undefined })
  const rootRef = useRef(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [visibility, setVisibility] = useState('private')
  const [posting, setPosting] = useState(false)
  const noteInputId = useId()

  // Cycle through the 4 colors. The "Highlight" button is the round
  // swatch that shows the current color and advances to the next on
  // click; individual color swatches let the user jump directly.
  const cycleColor = useCallback(() => {
    const next =
      HIGHLIGHT_COLORS[(HIGHLIGHT_COLORS.indexOf(activeColor) + 1) % HIGHLIGHT_COLORS.length]
    onColorChange?.(next)
  }, [activeColor, onColorChange])

  // Click-outside closes. We use mousedown so the menu doesn't flash a
  // visible re-render between mouseup and the next paint.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    function onDocDown(event) {
      const root = rootRef.current
      if (!root) return
      if (root.contains(event.target)) return
      onClose?.()
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('touchstart', onDocDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('touchstart', onDocDown)
    }
  }, [onClose])

  // Escape closes any nested popover; if neither is open, close the
  // toolbar entirely.
  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape') return
      if (noteOpen) {
        event.preventDefault()
        setNoteOpen(false)
        return
      }
      if (visibilityOpen) {
        event.preventDefault()
        setVisibilityOpen(false)
        return
      }
      onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [noteOpen, visibilityOpen, onClose])

  // Persist to the backend. Wrapped in try/catch with a toast on either
  // outcome so the user gets feedback even when offline.
  const persistAnnotation = useCallback(
    async (overrides = {}) => {
      if (!paperId) {
        // No paperId — fall back to the legacy onSave callback so older
        // call sites keep working.
        onSave?.()
        return
      }
      setPosting(true)
      try {
        // The backend's create-annotation route is module-rooted (POST
        // /api/scholar/annotations) and the `paperId` lives in the body
        // alongside the range descriptor. We forward whatever shape the
        // caller passed in `anchor` (selection range coords or a plain
        // text descriptor) and let the backend validate.
        const res = await fetch(`${API}/api/scholar/annotations`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            paperId,
            rangeJson: anchor || { text: selection || '' },
            color: activeColor,
            body: overrides.body ?? noteText.trim() ?? '',
            visibility: overrides.visibility ?? visibility,
          }),
        })
        if (!res.ok) {
          throw new Error(`Could not save annotation (${res.status})`)
        }
        showToast('Annotation saved', 'success')
        onSave?.()
        setNoteText('')
        setNoteOpen(false)
      } catch (err) {
        showToast(err?.message || 'Could not save annotation', 'error')
      } finally {
        setPosting(false)
      }
    },
    [paperId, anchor, selection, activeColor, noteText, visibility, onSave],
  )

  function handleCite() {
    if (typeof onCite === 'function') {
      try {
        onCite({ text: selection || '', anchor })
      } catch {
        // Caller threw — don't crash the toolbar.
      }
    }
    onClose?.()
  }

  // Desktop positioning: above by default, below when the selection is
  // within 60px of the viewport top. Caller passes selection-anchored
  // coords; we adjust the y-axis to keep the bar fully visible.
  const desktopPlacement = (() => {
    if (!position) return null
    const placeBelow = position.top < VIEWPORT_TOP_THRESHOLD
    return {
      position: 'fixed',
      top: placeBelow ? position.top + 24 : Math.max(8, position.top - TOOLBAR_HEIGHT - 12),
      left: Math.max(8, position.left),
      transform: 'translateX(-50%)',
    }
  })()

  if (!isMobile && !position) return null

  // Hidden-but-rendered when there's no selection on mobile would
  // produce a permanent bar; the parent controls visibility via
  // `position` (desktop) and a non-null `selection` (mobile).
  if (isMobile && !selection) return null

  const containerStyle = isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'var(--sh-surface)',
        borderTop: '1px solid var(--sh-border)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        transition: reducedMotion ? 'none' : 'transform 180ms ease-out',
      }
    : {
        ...desktopPlacement,
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 999,
        boxShadow: 'var(--shadow-md)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 6,
        transition: reducedMotion ? 'none' : 'opacity 120ms ease-out',
      }

  const buttonBase = {
    minWidth: 44,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 0,
    borderRadius: 8,
    color: 'var(--sh-text)',
    fontFamily: 'inherit',
    fontSize: 'var(--type-sm)',
    cursor: 'pointer',
    padding: '0 10px',
  }

  return (
    <div
      ref={rootRef}
      className="annotation-toolbar"
      style={containerStyle}
      role="toolbar"
      aria-label="Annotation toolbar"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: isMobile ? '8px 12px' : 0,
          justifyContent: isMobile ? 'space-around' : 'flex-start',
          width: '100%',
        }}
      >
        {/* Highlight: shows current color, cycles on click. Color swatches
            sit inline next to the main highlight button so power users
            can jump directly. */}
        <button
          type="button"
          onClick={cycleColor}
          aria-label={`Highlight (${activeColor})`}
          style={{
            ...buttonBase,
            background: COLOR_HEX[activeColor] || COLOR_HEX.yellow,
            color: 'var(--sh-slate-900)',
            fontWeight: 600,
            padding: '0 14px',
          }}
        >
          Highlight
        </button>
        {!isMobile && (
          <div role="group" aria-label="Highlight color" style={{ display: 'flex', gap: 2 }}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="annotation-toolbar__color"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                }}
                aria-pressed={activeColor === c}
                aria-label={`Highlight ${c}`}
                onClick={() => onColorChange?.(c)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: COLOR_HEX[c],
                    outline:
                      activeColor === c ? '2px solid var(--sh-text)' : '1px solid var(--sh-border)',
                    outlineOffset: 1,
                    display: 'inline-block',
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Note — toggles an inline text input. Cmd/Ctrl+Enter posts. */}
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          aria-pressed={noteOpen}
          aria-expanded={noteOpen}
          aria-controls={noteInputId}
          aria-label="Attach a note"
          style={buttonBase}
        >
          Note
        </button>

        {/* Cite — forward the selection to the parent's cite flow. */}
        <button
          type="button"
          onClick={handleCite}
          aria-label="Cite this passage"
          style={buttonBase}
        >
          Cite
        </button>

        {/* Visibility — dropdown with private / school / public. */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setVisibilityOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={visibilityOpen}
            aria-label={`Visibility: ${visibility}`}
            style={buttonBase}
          >
            {visibility === 'private' ? 'Private' : visibility === 'school' ? 'School' : 'Public'}
          </button>
          {visibilityOpen && (
            <div
              role="menu"
              aria-label="Visibility options"
              style={{
                position: 'absolute',
                bottom: isMobile ? '100%' : 'auto',
                top: isMobile ? 'auto' : '100%',
                marginTop: isMobile ? 0 : 6,
                marginBottom: isMobile ? 6 : 0,
                right: 0,
                background: 'var(--sh-surface)',
                border: '1px solid var(--sh-border)',
                borderRadius: 10,
                boxShadow: 'var(--shadow-md)',
                minWidth: 140,
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                zIndex: 1001,
              }}
            >
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={visibility === opt.id}
                  onClick={() => {
                    setVisibility(opt.id)
                    setVisibilityOpen(false)
                  }}
                  style={{
                    ...buttonBase,
                    justifyContent: 'flex-start',
                    width: '100%',
                    padding: '8px 10px',
                    background: visibility === opt.id ? 'var(--sh-soft)' : 'transparent',
                    fontWeight: visibility === opt.id ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => persistAnnotation()}
          disabled={posting}
          className="scholar-action-btn scholar-action-btn--primary"
          aria-label="Save annotation"
          style={{
            ...buttonBase,
            background: 'var(--sh-brand, #2563eb)',
            color: 'var(--sh-on-brand, #fff)',
            padding: '0 14px',
            fontWeight: 600,
            cursor: posting ? 'wait' : 'pointer',
          }}
        >
          {posting ? 'Saving…' : 'Save'}
        </button>

        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="Close annotation toolbar"
          style={buttonBase}
        >
          Close
        </button>
      </div>

      {/* Inline note input — appears underneath the action row on mobile,
          above on desktop (below when placed-below). Cmd/Ctrl+Enter
          posts; Escape collapses (handled by the document key listener). */}
      {noteOpen && (
        <div
          style={{
            padding: isMobile ? '10px 12px' : '8px',
            borderTop: isMobile ? '1px solid var(--sh-border)' : 0,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <textarea
            id={noteInputId}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                persistAnnotation({ body: noteText.trim() })
              }
            }}
            placeholder="Add a note (Cmd/Ctrl+Enter to save)"
            rows={2}
            maxLength={1000}
            aria-label="Annotation note"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              color: 'var(--sh-text)',
              fontFamily: 'inherit',
              fontSize: 'var(--type-sm)',
              resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  )
}
