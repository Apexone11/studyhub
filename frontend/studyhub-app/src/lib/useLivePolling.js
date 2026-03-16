import { startTransition, useEffect, useRef } from 'react'

const HAS_WINDOW = typeof window !== 'undefined'
const HAS_DOCUMENT = typeof document !== 'undefined'

export function useLivePolling(task, options = {}) {
  const {
    enabled = true,
    intervalMs = 30000,
    immediate = true,
    pauseWhenHidden = true,
    refreshKey,
  } = options

  const runningRef = useRef(false)
  const abortRef = useRef(null)
  const taskRef = useRef(task)
  const hasSeenRefreshKeyRef = useRef(false)
  const runTaskRef = useRef(async () => {})

  taskRef.current = task

  runTaskRef.current = async () => {
    if (!enabled || runningRef.current) return
    if (pauseWhenHidden && HAS_DOCUMENT && document.hidden) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    runningRef.current = true
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    abortRef.current = controller

    try {
      await taskRef.current({
        signal: controller?.signal,
        startTransition,
      })
    } catch (error) {
      if (error?.name !== 'AbortError') {
        // Callers own their error state; polling should stay quiet.
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      runningRef.current = false
    }
  }

  useEffect(() => {
    if (!enabled || !HAS_WINDOW) return undefined

    const intervalId = window.setInterval(() => {
      void runTaskRef.current()
    }, intervalMs)

    function handleAttention() {
      if (!pauseWhenHidden || !HAS_DOCUMENT || document.visibilityState === 'visible') {
        void runTaskRef.current()
      }
    }

    window.addEventListener('focus', handleAttention)
    window.addEventListener('online', handleAttention)
    if (HAS_DOCUMENT) {
      document.addEventListener('visibilitychange', handleAttention)
    }

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleAttention)
      window.removeEventListener('online', handleAttention)
      if (HAS_DOCUMENT) {
        document.removeEventListener('visibilitychange', handleAttention)
      }
      abortRef.current?.abort()
      abortRef.current = null
      runningRef.current = false
    }
  }, [enabled, intervalMs, pauseWhenHidden])

  useEffect(() => {
    if (!enabled || !immediate || !HAS_WINDOW) return
    void runTaskRef.current()
  }, [enabled, immediate])

  useEffect(() => {
    if (!enabled || !immediate || !HAS_WINDOW) return
    if (typeof refreshKey === 'undefined') return
    if (!hasSeenRefreshKeyRef.current) {
      hasSeenRefreshKeyRef.current = true
      return
    }

    void runTaskRef.current()
  }, [enabled, immediate, refreshKey])
}
