// src/mobile/hooks/useInView.js
// Reports whether a ref target is currently intersecting the viewport.
// Used by StatCounter (count-up on reveal), pull-to-refresh, parallax guards.

import { useEffect, useRef, useState } from 'react'

function initialInView() {
  // Fail-open for SSR or environments without IntersectionObserver so
  // animations don't sit in their "before" state forever.
  if (typeof window === 'undefined') return true
  if (typeof IntersectionObserver === 'undefined') return true
  return false
}

export function useInView(options = {}) {
  const { threshold = 0.2, rootMargin = '0px', once = false } = options
  const ref = useRef(null)
  const [inView, setInView] = useState(initialInView)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const el = ref.current
    if (!el) return undefined
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setInView(entry.isIntersecting)
        if (once && entry.isIntersecting) obs.disconnect()
      },
      { threshold, rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin, once])

  return [ref, inView]
}

export default useInView
