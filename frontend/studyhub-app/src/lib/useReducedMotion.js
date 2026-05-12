/**
 * useReducedMotion — shared web hook reporting whether motion should be
 * minimised. Returns `true` when EITHER the OS-level
 * `prefers-reduced-motion: reduce` media query matches OR the in-app
 * Accessibility toggle (Settings → Accessibility → "Reduce motion") is
 * on. Reactive: re-renders when either signal changes.
 *
 * Use this hook to gate inline `transition` / `transform` strings or
 * `anime.js` calls inside React components. The CSS layer already
 * neutralises every declared `transition-duration` /
 * `animation-duration` via the global reset in `index.css`, but
 * components that compute keyframe / cubic-bezier strings from JS still
 * need a programmatic check.
 *
 * Mobile companion has its own hook at `mobile/hooks/useReducedMotion.js`
 * which also watches a body class. Kept separate so the mobile shell
 * stays self-contained.
 *
 * Loop P5 (2026-05-12).
 */
import { useEffect, useState } from 'react'

function readInitial() {
  if (typeof window === 'undefined') return false
  try {
    if (
      typeof document !== 'undefined' &&
      document.documentElement?.dataset?.reducedMotion === 'on'
    ) {
      return true
    }
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  } catch {
    /* SSR / unsupported */
  }
  return false
}

export function useReducedMotion() {
  // Lazy initializer — avoids the setState-in-effect lint rule and gives
  // the first render the correct value (no flash of animation).
  const [reduced, setReduced] = useState(readInitial)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function recompute() {
      setReduced(readInitial())
    }

    let mql = null
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', recompute)
      } else if (typeof mql.addListener === 'function') {
        // Safari < 14 fallback
        mql.addListener(recompute)
      }
    }

    // Watch the html element for the in-app toggle so the hook flips
    // immediately when the user lands in Settings → Accessibility and
    // turns the preference on/off.
    let observer = null
    if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
      observer = new MutationObserver(recompute)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-reduced-motion'],
      })
    }

    return () => {
      if (mql) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', recompute)
        } else if (typeof mql.removeListener === 'function') {
          mql.removeListener(recompute)
        }
      }
      if (observer) observer.disconnect()
    }
  }, [])

  return reduced
}

export default useReducedMotion
