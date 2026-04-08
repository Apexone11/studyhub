import { useCallback, useEffect, useRef } from 'react'
import { trackEvent } from './telemetry'

/**
 * Lightweight page-load timing hook.
 *
 * Measures two phases:
 *   1. API latency   — from mount/trigger to data arrival
 *   2. Time to content — from mount/trigger to first render with data
 *
 * Reports results to PostHog via trackEvent() once per page load.
 *
 * Usage:
 *   const timing = usePageTiming('feed')
 *   // In your data loader:
 *   timing.markFetchStart()
 *   const data = await fetch(...)
 *   timing.markFetchEnd()
 *   // In your render (or useEffect after data arrives):
 *   timing.markContentVisible()
 */
export function usePageTiming(pageName) {
  const reportedRef = useRef(false)
  const mountTimeRef = useRef(0)
  const fetchStartRef = useRef(0)
  const fetchEndRef = useRef(0)
  const contentVisibleRef = useRef(0)

  // Capture mount time and reset on pageName change
  useEffect(() => {
    reportedRef.current = false
    mountTimeRef.current = performance.now()
    fetchStartRef.current = 0
    fetchEndRef.current = 0
    contentVisibleRef.current = 0
  }, [pageName])

  const markFetchStart = useCallback(() => {
    fetchStartRef.current = performance.now()
    try { performance.mark(`${pageName}:fetch-start`) } catch { /* unsupported */ }
  }, [pageName])

  const markFetchEnd = useCallback(() => {
    fetchEndRef.current = performance.now()
    try { performance.mark(`${pageName}:fetch-end`) } catch { /* unsupported */ }
  }, [pageName])

  const markContentVisible = useCallback(() => {
    if (reportedRef.current) return
    contentVisibleRef.current = performance.now()
    reportedRef.current = true

    const mount = mountTimeRef.current
    const fetchStart = fetchStartRef.current || mount
    const fetchEnd = fetchEndRef.current
    const contentVisible = contentVisibleRef.current

    const apiLatencyMs = fetchEnd ? Math.round(fetchEnd - fetchStart) : null
    const timeToContentMs = Math.round(contentVisible - mount)

    try {
      performance.mark(`${pageName}:content-visible`)
      performance.measure(`${pageName}:time-to-content`, `${pageName}:fetch-start`, `${pageName}:content-visible`)
    } catch { /* marks may not exist */ }

    trackEvent('page_timing', {
      page: pageName,
      apiLatencyMs,
      timeToContentMs,
    })

    if (import.meta.env?.DEV) {
      console.debug(`[perf] ${pageName}`, { apiLatencyMs, timeToContentMs })
    }
  }, [pageName])

  return { markFetchStart, markFetchEnd, markContentVisible }
}
