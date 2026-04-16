// src/mobile/hooks/usePullToRefresh.js
// Lightweight pull-to-refresh for mobile pages.
// Attaches touch listeners to a scroll container and triggers onRefresh
// when the user pulls down past the threshold.

import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 80 // px to trigger refresh
const MAX_PULL = 120

export default function usePullToRefresh(onRefresh) {
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const containerRef = useRef(null)
  const startY = useRef(0)
  const isPulling = useRef(false)
  const pullRef = useRef(0) // mirror of pullDistance for stable closure
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function handleTouchStart(e) {
      if (el.scrollTop > 0) return
      startY.current = e.touches[0].clientY
      isPulling.current = true
    }

    function handleTouchMove(e) {
      if (!isPulling.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy < 0) {
        isPulling.current = false
        pullRef.current = 0
        setPullDistance(0)
        setPulling(false)
        return
      }
      const clamped = Math.min(dy * 0.5, MAX_PULL)
      pullRef.current = clamped
      setPullDistance(clamped)
      setPulling(clamped > 10)
    }

    async function handleTouchEnd() {
      if (!isPulling.current) return
      isPulling.current = false
      if (pullRef.current >= THRESHOLD && onRefreshRef.current) {
        setRefreshing(true)
        setPullDistance(THRESHOLD * 0.5)
        try {
          await onRefreshRef.current()
        } catch {
          // ignore
        }
        setRefreshing(false)
      }
      pullRef.current = 0
      setPullDistance(0)
      setPulling(false)
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd)
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, []) // stable — no deps that cause re-registration

  return { containerRef, pulling, refreshing, pullDistance }
}
