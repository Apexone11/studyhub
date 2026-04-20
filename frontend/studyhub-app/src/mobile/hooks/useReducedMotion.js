// src/mobile/hooks/useReducedMotion.js
// Reactively reports whether motion should be reduced, respecting both the
// OS-level `prefers-reduced-motion` media query and the user-controlled
// Settings toggle (body.sh-mobile-reduced-motion class).

import { useEffect, useState } from 'react'

function computeReduced() {
  if (typeof window === 'undefined') return false
  if (document.body.classList.contains('sh-mobile-reduced-motion')) return true
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(computeReduced)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleMql = () => setReduced(computeReduced())
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleMql)
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handleMql)
    }

    // Watch the body class for user-toggle changes.
    const observer = new MutationObserver(() => setReduced(computeReduced()))
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handleMql)
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(handleMql)
      }
      observer.disconnect()
    }
  }, [])

  return reduced
}

export default useReducedMotion
