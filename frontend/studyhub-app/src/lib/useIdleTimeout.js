import { useCallback, useEffect, useRef } from 'react'

const IDLE_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Calls `onIdle` after the user has been inactive for `timeoutMs`.
 * Only active when `enabled` is true (i.e. user is authenticated).
 */
export function useIdleTimeout(onIdle, { enabled = true, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const timerRef = useRef(null)
  const onIdleRef = useRef(onIdle)

  // Keep callback ref in sync via effect (React 19 disallows ref writes during render)
  useEffect(() => { onIdleRef.current = onIdle }, [onIdle])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs)
  }, [timeoutMs])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    resetTimer()

    for (const event of IDLE_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of IDLE_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [enabled, resetTimer])
}
