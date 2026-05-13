/**
 * useBottomSheetOnMobile — flips a modal's overlay/panel styles into a
 * native-feeling bottom-sheet on phone widths (≤ 767px) and keeps the
 * centered-card look everywhere else.
 *
 * Loop M17 (2026-05-13). Pairs with the `.sh-modal-bottom-sheet-mobile`
 * class in index.css. Both paths exist because some modals build their
 * surface entirely via inline styles (no className) — for those the hook
 * is the canonical mobile-flip; modals that opt in via class get the
 * same treatment from CSS alone.
 *
 * What the bottom-sheet flip does on phone:
 *   - Overlay anchors content to `flex-end` (slide-up from the bottom).
 *   - Panel sits flush against the screen edges, rounded top corners,
 *     full-width, max-height 92vh so the keyboard never traps the user.
 *   - A 4-pixel drag-handle indicator above the panel content hints at
 *     the swipe-down-to-dismiss gesture.
 *   - The hook respects `prefers-reduced-motion`: returns `noAnimation`
 *     so callers can disable the slide-in transform.
 *
 * Returns:
 *   {
 *     isMobile,         // true on phones (<= 767px)
 *     reducedMotion,    // user preference signal
 *     overlayMobileFlip,// merge into your overlayStyle when isMobile
 *     panelMobileFlip,  // merge into your panelStyle when isMobile
 *     dragHandleNode,   // <div /> to render at the top of the panel
 *     swipeHandlers,    // {onTouchStart,onTouchMove,onTouchEnd} for the panel
 *   }
 *
 * The swipe-down-to-dismiss handlers track the panel's translateY and
 * call `onDismiss` when the user releases past a ~80px / 25% threshold.
 * They no-op on desktop and when `disabled` is true (e.g. crop modals
 * that carry unsaved state).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useReducedMotion from './useReducedMotion'

const PHONE_MAX_WIDTH = 767
const SWIPE_DISMISS_PX = 80
const SWIPE_DISMISS_RATIO = 0.25
const HANDLE_HEIGHT = 26

function readIsMobile() {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches
  } catch {
    return (window.innerWidth || 1440) <= PHONE_MAX_WIDTH
  }
}

export function useBottomSheetOnMobile({ onDismiss, disabled = false } = {}) {
  const reducedMotion = useReducedMotion()
  const [isMobile, setIsMobile] = useState(readIsMobile)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`)
    const handler = (event) => setIsMobile(event.matches)
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', handler)
    else if (typeof mql.addListener === 'function') mql.addListener(handler)
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', handler)
      else if (typeof mql.removeListener === 'function') mql.removeListener(handler)
    }
  }, [])

  // Swipe-down dismiss tracking. We keep refs (not state) because the
  // values change at touchmove cadence and React state setters would
  // re-render every pixel — unacceptable inside a modal that may contain
  // a virtualized list. The panel's `transform` is poked imperatively
  // via the element ref.
  const panelElRef = useRef(null)
  const startYRef = useRef(0)
  const deltaYRef = useRef(0)
  const draggingRef = useRef(false)
  const setPanelRef = useCallback((node) => {
    panelElRef.current = node
  }, [])

  const swipeHandlers = useMemo(() => {
    if (!isMobile || disabled || typeof onDismiss !== 'function') return {}
    return {
      onTouchStart: (event) => {
        if (!event.touches || event.touches.length !== 1) return
        startYRef.current = event.touches[0].clientY
        deltaYRef.current = 0
        draggingRef.current = true
      },
      onTouchMove: (event) => {
        if (!draggingRef.current || !event.touches || event.touches.length !== 1) return
        const delta = event.touches[0].clientY - startYRef.current
        if (delta <= 0) {
          deltaYRef.current = 0
          if (panelElRef.current) panelElRef.current.style.transform = ''
          return
        }
        deltaYRef.current = delta
        if (panelElRef.current) {
          panelElRef.current.style.transform = `translateY(${delta}px)`
          panelElRef.current.style.transition = 'none'
        }
      },
      onTouchEnd: () => {
        if (!draggingRef.current) return
        draggingRef.current = false
        const panel = panelElRef.current
        const height = panel?.getBoundingClientRect().height || 0
        const threshold = Math.max(SWIPE_DISMISS_PX, height * SWIPE_DISMISS_RATIO)
        const passed = deltaYRef.current >= threshold
        if (panel) {
          panel.style.transition = reducedMotion ? 'none' : 'transform 180ms ease-out'
          panel.style.transform = ''
        }
        if (passed) onDismiss()
      },
      onTouchCancel: () => {
        draggingRef.current = false
        if (panelElRef.current) {
          panelElRef.current.style.transition = reducedMotion ? 'none' : 'transform 180ms ease-out'
          panelElRef.current.style.transform = ''
        }
      },
    }
  }, [isMobile, disabled, onDismiss, reducedMotion])

  const overlayMobileFlip = useMemo(() => {
    if (!isMobile) return null
    return {
      alignItems: 'flex-end',
      justifyContent: 'stretch',
      padding: 0,
    }
  }, [isMobile])

  const panelMobileFlip = useMemo(() => {
    if (!isMobile) return null
    return {
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      borderRadius: '16px 16px 0 0',
      maxHeight: '92vh',
      paddingTop: HANDLE_HEIGHT,
      // The slide-up animation is gated on prefers-reduced-motion. The
      // initial transform/opacity is applied via the `.sh-bottom-sheet-enter`
      // animation in index.css for declarative control; we set
      // `willChange: transform` here so browsers can promote the panel
      // to its own compositor layer pre-emptively (smoother on low-end
      // phones).
      willChange: 'transform',
    }
  }, [isMobile])

  const dragHandleNode = useMemo(() => {
    if (!isMobile) return null
    return (
      <div
        aria-hidden="true"
        className="sh-bottom-sheet-handle"
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 44,
          height: 4,
          borderRadius: 999,
          background: 'var(--sh-border)',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      />
    )
  }, [isMobile])

  return {
    isMobile,
    reducedMotion,
    overlayMobileFlip,
    panelMobileFlip,
    dragHandleNode,
    swipeHandlers,
    setPanelRef,
  }
}

export default useBottomSheetOnMobile
