/* ═══════════════════════════════════════════════════════════════════════════
 * usePullToRefresh — phone-only pull-to-refresh hook for the feed
 *
 * Library-free implementation per Loop M4 task spec:
 *   - touchstart at scrollTop=0 starts tracking
 *   - touchmove deltaY > 80 triggers the refresh on touchend
 *   - while pulling, exposes `pullDistance` so the caller can render a
 *     visual indicator (CSS width/translate driven by --feed-ptr-height)
 *
 * The hook is a no-op on:
 *   - non-coarse pointer devices (mouse users get the existing refresh)
 *   - viewports wider than 767px (desktop / tablet)
 *   - when `disabled` is true (loading state, etc.)
 *
 * Respects `prefers-reduced-motion` for the spinner animation via CSS,
 * but the gesture itself is non-animated and always available.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_TRIGGER_DISTANCE = 80
const PULL_MAX_DISTANCE = 120
const PULL_RESISTANCE = 2

function isPhoneViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(max-width: 767px)').matches
}

function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

export function usePullToRefresh({ onRefresh, disabled = false } = {}) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef(null)
  const trackingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  const handleTouchStart = useCallback(
    (event) => {
      if (disabled || refreshing) return
      if (!isPhoneViewport() || !isCoarsePointer()) return
      // Only engage when the page is scrolled to the top — otherwise the
      // user is mid-scroll and a refresh gesture would feel wrong.
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0
      if (scrollTop > 0) return
      startYRef.current = event.touches[0]?.clientY ?? null
      trackingRef.current = true
    },
    [disabled, refreshing],
  )

  const handleTouchMove = useCallback((event) => {
    if (!trackingRef.current || startYRef.current == null) return
    const currentY = event.touches[0]?.clientY ?? null
    if (currentY == null) return
    const deltaY = currentY - startYRef.current
    if (deltaY <= 0) {
      setPullDistance(0)
      return
    }
    // Apply resistance so the pull feels rubbery — gets progressively
    // harder as the user drags further. Cap at PULL_MAX_DISTANCE.
    const resisted = Math.min(deltaY / PULL_RESISTANCE, PULL_MAX_DISTANCE)
    setPullDistance(resisted)
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (!trackingRef.current) return
    const shouldRefresh = pullDistance >= PULL_TRIGGER_DISTANCE
    trackingRef.current = false
    startYRef.current = null
    if (shouldRefresh && onRefreshRef.current) {
      setRefreshing(true)
      setPullDistance(0)
      try {
        await onRefreshRef.current()
      } finally {
        setRefreshing(false)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    // Passive listeners — we don't preventDefault. The browser's native
    // overscroll bounce is what shows the rubber-band visual; our hook
    // simply detects the gesture and runs the refresh on release.
    const opts = { passive: true }
    window.addEventListener('touchstart', handleTouchStart, opts)
    window.addEventListener('touchmove', handleTouchMove, opts)
    window.addEventListener('touchend', handleTouchEnd, opts)
    window.addEventListener('touchcancel', handleTouchEnd, opts)
    return () => {
      window.removeEventListener('touchstart', handleTouchStart, opts)
      window.removeEventListener('touchmove', handleTouchMove, opts)
      window.removeEventListener('touchend', handleTouchEnd, opts)
      window.removeEventListener('touchcancel', handleTouchEnd, opts)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return {
    pullDistance,
    refreshing,
    ready: pullDistance >= PULL_TRIGGER_DISTANCE,
  }
}
