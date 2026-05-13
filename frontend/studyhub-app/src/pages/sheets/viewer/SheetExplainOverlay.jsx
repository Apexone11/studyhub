/* ═══════════════════════════════════════════════════════════════════════════
 * SheetExplainOverlay.jsx — "Explain this" floating tooltip for sheet viewer.
 *
 * Listens for text selection inside `containerRef` (the rendered sheet
 * content area). When the user releases a selection of ≥ 3 chars, the
 * overlay shows a small "Explain" pill anchored to the end of the
 * selection range. Click → POST /api/ai/sheets/:sheetId/explain, then
 * dispatch a `sh:ai-explain-request` window event so the AI bubble can
 * open and surface the explanation as a regular chat message.
 *
 * Gating (defense in depth — overlay + backend both enforce):
 *   - Hidden when no `user` is logged in.
 *   - Hidden when `quotaLeft <= 0` (the bubble's daily quota indicator).
 *   - Hidden when the active selection is empty / collapsed / not inside
 *     `containerRef`.
 *
 * Reduced motion: respects `prefers-reduced-motion: reduce` — fade-in
 * transition is skipped when the user has the OS preference set.
 *
 * Client-side sanitization (the backend also strips control chars, so
 * this is a UX nicety, not a security boundary):
 *   - Strip C0/C1 controls, zero-width chars, and bidi override marks.
 *   - Clamp to 2000 chars (backend's MAX_SELECTION_LENGTH).
 *
 * NOTE: this overlay never modifies the AiBubble; it dispatches an
 * event the bubble listens for. The bubble is read-only with respect
 * to this feature.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../../config'
import { authHeaders, PAGE_FONT } from '../../shared/pageUtils'

const MIN_SELECTION_LENGTH = 3
const MAX_SELECTION_LENGTH = 2000

// Same anchor set as the backend route (`ai.sheet.routes.js`). Keep in
// sync if you tighten either side — defense in depth wants both layers
// to scrub the same characters. Built from a string so the file source
// doesn't carry literal control chars; the lint disable below covers
// the single audited construction.
const CONTROL_CHAR_RE = new RegExp(
  // eslint-disable-next-line no-control-regex
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]',
  'g',
)

function sanitizeSelection(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(CONTROL_CHAR_RE, '').replace(/\s+/g, ' ').trim().slice(0, MAX_SELECTION_LENGTH)
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * @param {object} props
 * @param {{ id: number }} props.sheet
 * @param {object|null} props.user                 - Authenticated user from useSession.
 * @param {number} props.quotaLeft                 - chat.usage.daily.left from the AI chat hook.
 * @param {React.RefObject<HTMLElement>} props.containerRef - Sheet content panel ref.
 */
export default function SheetExplainOverlay({ sheet, user, quotaLeft, containerRef }) {
  const [anchor, setAnchor] = useState(null) // { x, y, selection }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Reduced-motion preference is *state*, not a ref — render reads it
  // and the lint rule (react-hooks/refs) forbids reading `.current`
  // during render. The MediaQueryList listener updates state, which
  // is exactly the React-recommended subscribe-to-external pattern.
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)

  // Re-evaluate motion preference if the OS preference changes mid-session.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => {
      setReducedMotion(e.matches)
    }
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  // Gating: don't even attach listeners unless eligible.
  const eligible =
    Boolean(user) && Number.isFinite(quotaLeft) && quotaLeft > 0 && Boolean(sheet?.id)

  // Selection listener — fires on mouseup AND on keyboard selection
  // (Shift+Arrow). Anchored to the end of the selection range so the
  // pill never covers the highlighted text.
  useEffect(() => {
    if (!eligible) return
    const container = containerRef?.current
    if (!container) return

    function handleSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setAnchor(null)
        return
      }
      const range = sel.getRangeAt(0)
      // Selection must be entirely (or at least partially) inside the
      // sheet content. `intersectsNode` works in all modern browsers;
      // we fall back to ancestor check if it's not available.
      const inside = container.contains(range.commonAncestorContainer)
      if (!inside) {
        setAnchor(null)
        return
      }
      const raw = sel.toString()
      const sanitized = sanitizeSelection(raw)
      if (sanitized.length < MIN_SELECTION_LENGTH) {
        setAnchor(null)
        return
      }
      // Anchor at the bottom-right of the selection's last client rect.
      const rects = range.getClientRects()
      const last =
        rects && rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()
      if (!last || (last.width === 0 && last.height === 0)) {
        setAnchor(null)
        return
      }
      // Offset slightly below the line so the pill doesn't cover text.
      setAnchor({
        x: Math.min(last.right, window.innerWidth - 140),
        y: last.bottom + 6,
        selection: sanitized,
      })
      setError(null)
    }

    // Debounce-via-requestAnimationFrame so dragging a selection
    // doesn't repaint the pill on every mousemove.
    let raf = null
    function debounced() {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(handleSelectionChange)
    }
    document.addEventListener('selectionchange', debounced)
    // Hide the pill on outside click.
    function handleDocMouseDown(e) {
      // If the click landed on the pill itself, let its onClick run.
      if (e.target && e.target.closest && e.target.closest('[data-sh-explain-pill]')) return
      // If the click cleared the selection entirely, the selectionchange
      // listener will handle it; otherwise just hide.
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) setAnchor(null)
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', debounced)
      document.removeEventListener('mousedown', handleDocMouseDown)
    }
  }, [eligible, containerRef])

  // Hide the pill when the user scrolls — anchor is computed in client
  // (viewport) coords, so scrolling makes the pill drift away from the
  // selection. Re-show happens on the next selection change.
  useEffect(() => {
    if (!anchor) return
    function handleScroll() {
      setAnchor(null)
    }
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', handleScroll, { capture: true })
  }, [anchor])

  const sheetId = sheet?.id
  const handleExplain = useCallback(async () => {
    if (!anchor || loading || !sheetId) return
    setLoading(true)
    setError(null)
    // Optimistically dispatch the user-facing event so the bubble can
    // open + show the selection immediately. The bubble decides whether
    // to insert it as a chat message or display it inline; this overlay
    // is intentionally unopinionated about how the bubble renders it.
    try {
      window.dispatchEvent(
        new CustomEvent('sh:ai-explain-request', {
          detail: { selection: anchor.selection, sheetId, phase: 'requested' },
        }),
      )
    } catch {
      /* environments without CustomEvent — ignore */
    }
    try {
      const res = await fetch(`${API}/api/ai/sheets/${sheetId}/explain`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ selection: anchor.selection }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      window.dispatchEvent(
        new CustomEvent('sh:ai-explain-request', {
          detail: {
            selection: anchor.selection,
            sheetId,
            phase: 'response',
            explanation: data.explanation,
            model: data.model,
          },
        }),
      )
      setAnchor(null)
    } catch (err) {
      setError(err?.message || 'Could not explain that selection.')
      // Mirror the error into the bubble so the user sees it in the same
      // surface they were watching for the answer — otherwise the floating
      // pill is the only signal something went wrong, and the bubble shows
      // a stuck "Thinking…" indicator forever.
      try {
        window.dispatchEvent(
          new CustomEvent('sh:ai-explain-request', {
            detail: {
              selection: anchor.selection,
              sheetId,
              phase: 'error',
              error: err?.message || 'Could not explain that selection.',
            },
          }),
        )
      } catch {
        /* environments without CustomEvent — ignore */
      }
    } finally {
      setLoading(false)
    }
  }, [anchor, loading, sheetId])

  if (!eligible || !anchor) return null

  const pill = (
    <div
      data-sh-explain-pill
      role="region"
      aria-label="Explain selected text"
      style={{
        position: 'fixed',
        top: anchor.y,
        left: anchor.x,
        zIndex: 9999,
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 999,
        boxShadow: '0 6px 24px rgba(15, 23, 42, 0.15)',
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: PAGE_FONT,
        // Animation respects user motion preferences. No transform-based
        // entrance when the OS reduce-motion flag is on.
        opacity: 1,
        transition: reducedMotion ? 'none' : 'opacity 120ms ease-out',
      }}
    >
      <button
        type="button"
        onClick={handleExplain}
        disabled={loading}
        style={{
          background: 'var(--sh-ai-gradient, linear-gradient(135deg, #7c3aed, #2563eb))',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: PAGE_FONT,
          letterSpacing: 0.2,
        }}
      >
        {loading ? 'Explaining…' : 'Explain'}
      </button>
      {error ? (
        <span
          role="alert"
          style={{
            color: 'var(--sh-danger-text)',
            fontSize: 11,
            fontWeight: 600,
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={error}
        >
          {error}
        </span>
      ) : null}
    </div>
  )

  return createPortal(pill, document.body)
}
