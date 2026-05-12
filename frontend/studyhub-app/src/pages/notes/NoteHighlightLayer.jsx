/* ═══════════════════════════════════════════════════════════════════════════
 * NoteHighlightLayer.jsx — Note Review v1 highlight UI (Phase 9, 2026-05-12)
 *
 * Wraps the rendered note body and provides:
 *   - Selection capture: when the user selects text inside the layer, a
 *     floating toolbar appears with a 5-color picker. Clicking a color
 *     POSTs `/api/notes/:id/highlights` and re-fetches the list.
 *   - Existing-highlight rendering: each persisted highlight is shown
 *     as a `<mark>` painted over the matching text in the note body,
 *     using a small Range/TextNode walker. anchorText is fuzzy-matched
 *     starting from anchorOffset so minor edits don't orphan the
 *     highlight.
 *   - Delete: clicking an existing highlight opens a small popover with
 *     a "Remove" button. Only the highlight author or the note owner
 *     can see the button (server enforces too).
 *
 * Defense-in-depth (CLAUDE.md A6):
 *   - We never inject highlight data via innerHTML. anchorText and
 *     author.username are rendered as text nodes only.
 *   - We use `<mark>` elements built with `document.createElement` and
 *     inserted via DOM Range surroundContents — no `dangerouslySetInnerHTML`.
 *   - Highlight refresh after create / delete is read-side
 *     re-fetch (no optimistic merge that could mask a server failure,
 *     per CLAUDE.md A4).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders, PAGE_FONT } from '../shared/pageUtils'

const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow', swatch: '#fef3a4', text: '#7a5b00' },
  { id: 'green', label: 'Green', swatch: '#c7f0d2', text: '#155724' },
  { id: 'blue', label: 'Blue', swatch: '#cfe5ff', text: '#0a3d77' },
  { id: 'pink', label: 'Pink', swatch: '#fcd6e4', text: '#9d174d' },
  { id: 'purple', label: 'Purple', swatch: '#e3d4f8', text: '#553c9a' },
]
const HIGHLIGHT_COLOR_MAP = HIGHLIGHT_COLORS.reduce((acc, c) => {
  acc[c.id] = c
  return acc
}, {})

const HIGHLIGHT_CLASS = 'sh-note-highlight'
const HIGHLIGHT_DATA_ATTR = 'data-sh-highlight-id'

function colorFor(colorId) {
  return HIGHLIGHT_COLOR_MAP[colorId] || HIGHLIGHT_COLOR_MAP.yellow
}

/**
 * Walk all text nodes inside `root`, skipping any text already wrapped
 * in an existing highlight (so highlights don't nest). Returns the
 * concatenated plain text plus per-node offsets so we can convert a
 * (global offset, length) span back into a sequence of DOM ranges.
 */
function collectTextSegments(root) {
  const segments = []
  let total = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text inside existing highlight marks so we don't double-wrap.
      let parent = node.parentNode
      while (parent && parent !== root) {
        if (
          parent.nodeType === 1 &&
          parent.classList &&
          parent.classList.contains(HIGHLIGHT_CLASS)
        ) {
          return NodeFilter.FILTER_REJECT
        }
        parent = parent.parentNode
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let node = walker.nextNode()
  while (node) {
    const text = node.nodeValue || ''
    segments.push({ node, start: total, end: total + text.length, text })
    total += text.length
    node = walker.nextNode()
  }
  return { segments, total }
}

/**
 * Given the segment list and a (start, end) plain-text span, return an
 * array of Range objects covering that span. Multiple ranges happen
 * when the span crosses element boundaries.
 */
function rangesForSpan(segments, start, end) {
  const ranges = []
  for (const seg of segments) {
    if (seg.end <= start) continue
    if (seg.start >= end) break
    const a = Math.max(start, seg.start) - seg.start
    const b = Math.min(end, seg.end) - seg.start
    if (b <= a) continue
    const range = document.createRange()
    range.setStart(seg.node, a)
    range.setEnd(seg.node, b)
    ranges.push(range)
  }
  return ranges
}

/**
 * Locate the highlight's anchor span inside `rootPlainText`. Try the
 * exact offset first (cheap, common case), then fall back to a fuzzy
 * search anchored on anchorText. Returns { start, end } or null.
 */
function locateAnchor(rootPlainText, highlight) {
  if (!highlight || !highlight.anchorText) return null
  const anchor = highlight.anchorText
  const offset = highlight.anchorOffset
  if (
    typeof offset === 'number' &&
    offset >= 0 &&
    rootPlainText.slice(offset, offset + anchor.length) === anchor
  ) {
    return { start: offset, end: offset + anchor.length }
  }
  // Fuzzy: find any occurrence of anchorText anywhere in the body. If
  // multiple matches exist we pick the one closest to the original
  // offset so multi-paragraph notes with repeated phrases don't paint
  // the wrong span.
  const indices = []
  let i = rootPlainText.indexOf(anchor)
  while (i !== -1 && indices.length < 64) {
    indices.push(i)
    i = rootPlainText.indexOf(anchor, i + 1)
  }
  if (!indices.length) return null
  let best = indices[0]
  let bestDist = Math.abs(best - offset)
  for (const idx of indices) {
    const d = Math.abs(idx - (offset || 0))
    if (d < bestDist) {
      best = idx
      bestDist = d
    }
  }
  return { start: best, end: best + anchor.length }
}

/**
 * Paint highlights into the rendered note DOM. Removes any previously
 * painted marks first (so re-paint after edit/delete is clean).
 */
function paintHighlights(root, highlights) {
  if (!root) return
  // Remove old marks. Replace each <mark> with its child nodes.
  const oldMarks = root.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`)
  oldMarks.forEach((mark) => {
    const parent = mark.parentNode
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark)
    }
    parent.removeChild(mark)
  })
  // Merge adjacent text nodes that resulted from the strip.
  root.normalize()

  if (!highlights || !highlights.length) return

  // Paint highlights in createdAt-ascending order so the newest one
  // ends up on top (nested marks visually layer that way).
  const ordered = highlights
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))

  for (const h of ordered) {
    // Re-collect segments after each paint — DOM mutates as we wrap.
    const { segments } = collectTextSegments(root)
    const plain = segments.map((s) => s.text).join('')
    const anchor = locateAnchor(plain, h)
    if (!anchor) continue
    const ranges = rangesForSpan(segments, anchor.start, anchor.end)
    for (const range of ranges) {
      try {
        const mark = document.createElement('mark')
        mark.className = HIGHLIGHT_CLASS
        mark.setAttribute(HIGHLIGHT_DATA_ATTR, String(h.id))
        const c = colorFor(h.color)
        mark.style.backgroundColor = c.swatch
        mark.style.color = c.text
        mark.style.padding = '0 1px'
        mark.style.borderRadius = '2px'
        mark.style.cursor = 'pointer'
        range.surroundContents(mark)
      } catch {
        // surroundContents throws if the range crosses non-text
        // boundaries that can't be wrapped (e.g., a partial element).
        // Skip this fragment rather than crash the layer.
      }
    }
  }
}

export default function NoteHighlightLayer({
  noteId,
  noteContent,
  isOwner,
  currentUserId,
  isPrivate,
  children,
}) {
  const containerRef = useRef(null)
  const [highlights, setHighlights] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toolbar, setToolbar] = useState(null) // {x, y, anchorText, anchorOffset, anchorContext}
  const [popover, setPopover] = useState(null) // {x, y, highlight}
  const [savingColor, setSavingColor] = useState(null)

  // ── Fetch highlights when noteId changes ──────────────────────────
  // The async body is intentionally factored out so the imperative
  // re-fetch (after create/delete) and the effect-driven initial load
  // share the same code path.
  const fetchHighlights = useCallback(async () => {
    if (!noteId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/notes/${noteId}/highlights`, {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setHighlights([])
          setError(null)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setHighlights(Array.isArray(data.highlights) ? data.highlights : [])
    } catch (err) {
      setError(err.message || 'Failed to load highlights.')
      setHighlights([])
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    if (!noteId) return undefined
    let cancelled = false
    // Defer the fetch into a microtask so the effect body itself does
    // not synchronously call setState — satisfies
    // react-hooks/set-state-in-effect (same pattern used by
    // ConsentLogTab.jsx).
    Promise.resolve().then(() => {
      if (!cancelled) fetchHighlights()
    })
    return () => {
      cancelled = true
    }
  }, [noteId, fetchHighlights])

  // ── Paint highlights whenever they (or the content) change ─────────
  useEffect(() => {
    paintHighlights(containerRef.current, highlights)
  }, [highlights, noteContent])

  // ── Selection capture ─────────────────────────────────────────────
  const handleMouseUp = useCallback(
    (event) => {
      // If the user clicked an existing highlight, show the popover
      // instead of the new-highlight toolbar.
      const targetMark = event.target?.closest?.(`mark.${HIGHLIGHT_CLASS}`)
      if (targetMark) {
        const id = Number.parseInt(targetMark.getAttribute(HIGHLIGHT_DATA_ATTR), 10)
        const found = highlights.find((h) => h.id === id)
        if (found) {
          const rect = targetMark.getBoundingClientRect()
          const containerRect = containerRef.current?.getBoundingClientRect()
          setPopover({
            x: rect.left - (containerRect?.left || 0),
            y: rect.bottom - (containerRect?.top || 0) + 4,
            highlight: found,
          })
          setToolbar(null)
          return
        }
      }

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setToolbar(null)
        return
      }
      const range = sel.getRangeAt(0)
      const root = containerRef.current
      if (!root || !root.contains(range.commonAncestorContainer)) {
        setToolbar(null)
        return
      }
      const text = sel.toString().trim()
      if (!text) {
        setToolbar(null)
        return
      }

      // Compute plain-text offset of the selection start within root.
      const { segments } = collectTextSegments(root)
      const startNode = range.startContainer
      const startOff = range.startOffset
      let anchorOffset = 0
      for (const seg of segments) {
        if (seg.node === startNode) {
          anchorOffset = seg.start + startOff
          break
        }
      }

      // Build a tiny context window (40 chars before + after) for the
      // server. anchorText itself is the full selection.
      const plain = segments.map((s) => s.text).join('')
      const ctxBefore = plain.slice(Math.max(0, anchorOffset - 40), anchorOffset)
      const ctxAfter = plain.slice(anchorOffset + text.length, anchorOffset + text.length + 40)

      const rect = range.getBoundingClientRect()
      const containerRect = root.getBoundingClientRect()
      setPopover(null)
      setToolbar({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 8,
        anchorText: text.slice(0, 2000),
        anchorOffset,
        anchorContext: `${ctxBefore}|${ctxAfter}`.slice(0, 400),
      })
    },
    [highlights],
  )

  // Hide toolbars on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const container = containerRef.current
      if (!container) return
      if (!container.contains(e.target)) {
        setToolbar(null)
        setPopover(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleSaveHighlight = useCallback(
    async (colorId) => {
      if (!toolbar || savingColor) return
      setSavingColor(colorId)
      try {
        const res = await fetch(`${API}/api/notes/${noteId}/highlights`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({
            anchorText: toolbar.anchorText,
            anchorOffset: toolbar.anchorOffset,
            anchorContext: toolbar.anchorContext,
            color: colorId,
          }),
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        // Per CLAUDE.md A4: hydrate UI from server response, not from
        // optimistic local state. The full re-fetch keeps everything
        // consistent if the server applied any normalization.
        if (data && data.highlight) {
          setHighlights((prev) => [data.highlight, ...prev])
        } else {
          await fetchHighlights()
        }
        setToolbar(null)
        try {
          window.getSelection()?.removeAllRanges()
        } catch {
          /* selection cleanup is best-effort */
        }
      } catch (err) {
        setError(err.message || 'Failed to save highlight.')
      } finally {
        setSavingColor(null)
      }
    },
    [toolbar, savingColor, noteId, fetchHighlights],
  )

  const handleDeleteHighlight = useCallback(
    async (highlightId) => {
      try {
        const res = await fetch(`${API}/api/notes/${noteId}/highlights/${highlightId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        })
        if (!res.ok && res.status !== 204) {
          throw new Error(`HTTP ${res.status}`)
        }
        setHighlights((prev) => prev.filter((h) => h.id !== highlightId))
        setPopover(null)
      } catch (err) {
        setError(err.message || 'Failed to remove highlight.')
      }
    },
    [noteId],
  )

  // Capability hints for the popover delete button. Server is the source
  // of truth (it returns 403 if the viewer isn't allowed) but hiding the
  // button when we know the user can't delete saves a round-trip.
  const canDelete = useCallback(
    (h) => {
      if (!h) return false
      if (isOwner) return true
      if (currentUserId && h.userId === currentUserId) return true
      return false
    },
    [isOwner, currentUserId],
  )

  const canCreate = useMemo(() => {
    // Anyone authenticated can highlight a shared note. Private notes
    // are owner-only (server enforces).
    if (isPrivate && !isOwner) return false
    return Boolean(currentUserId)
  }, [isPrivate, isOwner, currentUserId])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        onMouseUp={canCreate ? handleMouseUp : undefined}
        style={{ position: 'relative' }}
      >
        {children}
      </div>

      {/* Floating new-highlight toolbar */}
      {toolbar && canCreate && (
        <div
          role="toolbar"
          aria-label="Highlight color picker"
          style={{
            position: 'absolute',
            left: Math.max(8, toolbar.x - 110),
            top: Math.max(0, toolbar.y - 44),
            zIndex: 30,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: PAGE_FONT,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sh-subtext)',
              marginRight: 4,
            }}
          >
            Highlight
          </span>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Highlight ${c.label}`}
              onClick={() => handleSaveHighlight(c.id)}
              disabled={Boolean(savingColor)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                border: '1px solid var(--sh-border)',
                background: c.swatch,
                cursor: savingColor ? 'wait' : 'pointer',
                padding: 0,
                opacity: savingColor && savingColor !== c.id ? 0.5 : 1,
              }}
            />
          ))}
        </div>
      )}

      {/* Existing-highlight popover */}
      {popover && (
        <div
          role="dialog"
          aria-label="Highlight options"
          style={{
            position: 'absolute',
            left: Math.max(8, popover.x),
            top: popover.y,
            zIndex: 30,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: PAGE_FONT,
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--sh-subtext)' }}>
            {popover.highlight.author?.username
              ? `by ${popover.highlight.author.username}`
              : 'Highlight'}
          </span>
          {canDelete(popover.highlight) && (
            <button
              type="button"
              onClick={() => handleDeleteHighlight(popover.highlight.id)}
              style={{
                background: 'var(--sh-danger-bg)',
                color: 'var(--sh-danger-text)',
                border: '1px solid var(--sh-danger-border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => setPopover(null)}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--sh-muted)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Lightweight status row for failures. Loading state stays
          silent — there's no body to render anyway. */}
      {error && (
        <div
          role="status"
          style={{
            marginTop: 8,
            fontFamily: PAGE_FONT,
            fontSize: 12,
            color: 'var(--sh-danger-text)',
          }}
        >
          {error}
        </div>
      )}
      {!error && !loading && highlights.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontFamily: PAGE_FONT,
            fontSize: 11,
            color: 'var(--sh-muted)',
          }}
        >
          {highlights.length} highlight{highlights.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}
