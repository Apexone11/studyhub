/**
 * ReadingProgressBar — slim 3px bar pinned to the top of the viewport
 * that tracks the reader's scroll progress through a target element
 * (default `#scholar-paper-body`).
 *
 * Mechanics:
 *  - `IntersectionObserver` confirms the target exists and re-measures
 *    its rect on resize / DOM changes.
 *  - Scroll listener attached `{ passive: true }` so it never blocks
 *    the compositor.
 *  - `requestAnimationFrame` throttle: at most one progress update per
 *    frame. The rAF handle lives in a `useRef` so cleanup cancels any
 *    pending frame on unmount.
 *
 * Hidden on phones (<768px) — the bar competes with limited vertical
 * real estate and Mobile Safari's URL bar collapse already gives the
 * reader an implicit progress signal. Visibility is controlled with a
 * media-query-driven CSS class instead of unmount/mount so resize
 * doesn't churn the observer.
 *
 * Reduced motion: render the bar at the current width but skip the
 * `transition` so width changes don't animate. WCAG SC 2.3.3.
 *
 * If the target element doesn't exist when we mount or after a resize,
 * render nothing. Don't crash the page just because a route hasn't yet
 * laid out the target.
 */
import { useEffect, useRef, useState } from 'react'

const DEFAULT_SELECTOR = '#scholar-paper-body'
const MOBILE_BREAKPOINT_PX = 768

/**
 * Compute scroll progress through `target` as a value 0..1.
 * The element is "started" when its top crosses the viewport top, and
 * "finished" when its bottom crosses the viewport top.
 */
function computeProgress(target) {
  const rect = target.getBoundingClientRect()
  const total = rect.height - window.innerHeight
  if (total <= 0) {
    // Element fits entirely within the viewport — progress is 1 once
    // the user has reached / passed it.
    return rect.top <= 0 ? 1 : 0
  }
  const scrolled = -rect.top
  if (scrolled <= 0) return 0
  if (scrolled >= total) return 1
  return scrolled / total
}

export default function ReadingProgressBar({ targetSelector = DEFAULT_SELECTOR }) {
  const [hasTarget, setHasTarget] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const rafRef = useRef(/** @type {number | null} */ (null))

  // Track viewport width with a matchMedia listener — cheaper than a
  // resize handler.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update)
      return () => mql.removeEventListener('change', update)
    }
    mql.addListener(update)
    return () => mql.removeListener(update)
  }, [])

  // Reduced-motion preference.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mql.matches)
    update()
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update)
      return () => mql.removeEventListener('change', update)
    }
    mql.addListener(update)
    return () => mql.removeListener(update)
  }, [])

  // Scroll + observer wiring. State updates all happen inside the
  // rAF callback (async) so we don't trip the
  // `react-hooks/set-state-in-effect` rule.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    let cancelled = false
    let observer = null

    const update = () => {
      if (cancelled) return
      const current = document.querySelector(targetSelector)
      if (!current) {
        setHasTarget(false)
        setProgress(0)
        return
      }
      setHasTarget(true)
      setProgress(computeProgress(current))
    }

    const schedule = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        update()
      })
    }

    // Initial measurement happens on the next frame — keeps the
    // effect body free of synchronous setState.
    schedule()

    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })

    // IntersectionObserver triggers re-measures on visibility flips
    // (route transitions, lazy-mounted content). We observe the
    // target if present; if absent the scroll/resize handlers will
    // still pick it up once it appears.
    const target = document.querySelector(targetSelector)
    if (target && typeof window.IntersectionObserver === 'function') {
      observer = new window.IntersectionObserver(
        () => {
          schedule()
        },
        { threshold: [0, 0.5, 1] },
      )
      observer.observe(target)
    }

    return () => {
      cancelled = true
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (observer) observer.disconnect()
    }
  }, [targetSelector])

  if (!hasTarget) return null
  if (isMobile) return null

  const pct = Math.max(0, Math.min(1, progress)) * 100

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 950,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--sh-accent)',
          transition: reducedMotion ? 'none' : 'width 120ms linear',
        }}
      />
    </div>
  )
}
