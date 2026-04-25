// src/mobile/hooks/useScrollDirection.js
// Tracks vertical scroll direction on the window with a small threshold to
// avoid thrashing on tiny movements. Returns 'up' | 'down' | 'idle'.
//
// Designed for chrome that hides on scroll-down and reappears on scroll-up
// (e.g., the mobile BottomTabBar). Always reports 'up' when the user is near
// the top of the page or has bottom-scrolled the viewport, so the chrome
// stays pinned in those positions.

import { useEffect, useState, useRef } from 'react'

const DEFAULT_THRESHOLD = 8
const TOP_SAFE_ZONE = 60

export function useScrollDirection({ threshold = DEFAULT_THRESHOLD } = {}) {
  const [direction, setDirection] = useState('up')
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    lastY.current = window.scrollY || 0

    const update = () => {
      const y = window.scrollY || 0
      const dy = y - lastY.current

      // Near the top: always show chrome.
      if (y < TOP_SAFE_ZONE) {
        lastY.current = y
        setDirection((prev) => (prev === 'up' ? prev : 'up'))
        ticking.current = false
        return
      }

      // Ignore micro-movements.
      if (Math.abs(dy) < threshold) {
        ticking.current = false
        return
      }

      // At the very bottom of the page, keep chrome visible.
      const atBottom = window.innerHeight + y >= (document.documentElement.scrollHeight || 0) - 2
      if (atBottom) {
        lastY.current = y
        setDirection((prev) => (prev === 'up' ? prev : 'up'))
        ticking.current = false
        return
      }

      const next = dy > 0 ? 'down' : 'up'
      lastY.current = y
      setDirection((prev) => (prev === next ? prev : next))
      ticking.current = false
    }

    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return direction
}

export default useScrollDirection
