/**
 * WhyThisPaperTooltip — hover/long-press tooltip explaining why a
 * Scholar search result matched the query.
 *
 * Props:
 *   matchExplanation: {
 *     matchedOn: string[],          // e.g. ["Title", "Abstract"]
 *     topKeyword?: string,
 *     citationWeightTopPercent?: number,
 *   } | null | undefined
 *   children: ReactNode               wrapped element receiving events
 *
 * Renders nothing extra when `matchExplanation` is falsy — just
 * returns `children` so callers can opt-in cheaply.
 *
 * Pure HTML+CSS (no Radix dep). Positioning logic:
 *  - Default: above the wrapped element.
 *  - If the wrapped element's `top` is within 80px of the viewport top,
 *    flip below to avoid clipping.
 *
 * Touch:
 *  - 600ms long-press fires the tooltip (per WCAG 2.5.4 / Material's
 *    long-press timing).
 *  - A backdrop tap-area closes it.
 *
 * Desktop: pointerenter / pointerleave + focusin / focusout for
 * keyboard accessibility.
 */
import { useEffect, useId, useRef, useState } from 'react'

const LONG_PRESS_MS = 600
const FLIP_THRESHOLD_PX = 80
const ARROW_SIZE = 6

export default function WhyThisPaperTooltip({ matchExplanation, children }) {
  // Always declare hooks unconditionally — the early-return below is
  // for the render output, not for hook ordering.
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState(/** @type {'top'|'bottom'} */ ('top'))
  const wrapperRef = useRef(/** @type {HTMLSpanElement | null} */ (null))
  const longPressTimer = useRef(/** @type {number | null} */ (null))
  const tooltipId = useId()

  // Determine top/bottom placement based on the wrapper's rect.
  const measure = () => {
    const el = wrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPlacement(rect.top < FLIP_THRESHOLD_PX ? 'bottom' : 'top')
  }

  // Clear long-press timer on unmount / open changes to avoid setting
  // state on a stale element.
  useEffect(() => {
    return () => {
      if (longPressTimer.current != null) {
        window.clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }
  }, [])

  // No explanation → pass-through. Hooks already ran, so this early
  // return is safe.
  if (!matchExplanation) return <>{children}</>

  const show = () => {
    measure()
    setOpen(true)
  }
  const hide = () => setOpen(false)

  const handleTouchStart = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
    }
    longPressTimer.current = window.setTimeout(() => {
      show()
      longPressTimer.current = null
    }, LONG_PRESS_MS)
  }
  const handleTouchEnd = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const matchedOn = Array.isArray(matchExplanation.matchedOn) ? matchExplanation.matchedOn : []
  const topKeyword = matchExplanation.topKeyword
  const citationRank = matchExplanation.citationWeightTopPercent

  // Tooltip absolute positioning relative to a `position: relative`
  // wrapper. Width is capped so long text wraps cleanly.
  const tooltipStyle = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    ...(placement === 'top'
      ? { bottom: `calc(100% + ${ARROW_SIZE + 4}px)` }
      : { top: `calc(100% + ${ARROW_SIZE + 4}px)` }),
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    border: '1px solid var(--sh-border)',
    borderRadius: 10,
    padding: '10px 12px',
    minWidth: 220,
    maxWidth: 320,
    boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,0.10))',
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    fontSize: 12,
    lineHeight: 1.5,
    zIndex: 1100,
    pointerEvents: 'auto',
  }

  const arrowStyle = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%) rotate(45deg)',
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE * 2,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    ...(placement === 'top'
      ? {
          bottom: -ARROW_SIZE,
          borderTop: 'none',
          borderLeft: 'none',
        }
      : {
          top: -ARROW_SIZE,
          borderBottom: 'none',
          borderRight: 'none',
        }),
  }

  return (
    <span
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onPointerEnter={(e) => {
        // pointerEnter fires for mouse + pen; ignore touch (handled
        // by long-press) to avoid double-firing.
        if (e.pointerType === 'touch') return
        show()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return
        hide()
      }}
      onFocus={show}
      onBlur={hide}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open ? (
        <>
          {/* Backdrop tap-area only on touch — invisible div that
              closes the tooltip when tapped. Pointer-events confined
              to touch by only mounting when open. */}
          <span
            aria-hidden="true"
            onTouchStart={(e) => {
              e.stopPropagation()
              hide()
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1099,
              background: 'transparent',
            }}
          />
          <div role="tooltip" id={tooltipId} style={tooltipStyle}>
            {matchedOn.length > 0 ? (
              <div style={{ marginBottom: 6 }}>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--sh-text-muted)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Matched on
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  {matchedOn.map((field) => (
                    <span
                      key={field}
                      style={{
                        background: 'var(--sh-soft)',
                        color: 'var(--sh-text)',
                        border: '1px solid var(--sh-border)',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                      }}
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {topKeyword ? (
              <div style={{ marginTop: 6, color: 'var(--sh-text)' }}>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--sh-text-muted)',
                  }}
                >
                  Top keyword:
                </span>{' '}
                {topKeyword}
              </div>
            ) : null}
            {typeof citationRank === 'number' && Number.isFinite(citationRank) ? (
              <div style={{ marginTop: 4, color: 'var(--sh-text)' }}>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--sh-text-muted)',
                  }}
                >
                  Citation-weight rank:
                </span>{' '}
                top {Math.max(1, Math.min(100, Math.round(citationRank)))}%
              </div>
            ) : null}
            <span aria-hidden="true" style={arrowStyle} />
          </div>
        </>
      ) : null}
    </span>
  )
}
