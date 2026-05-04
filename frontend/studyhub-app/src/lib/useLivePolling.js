import { startTransition as reactStartTransition, useEffect, useRef } from 'react'
import { isStreamingActive } from './streamState'

const HAS_WINDOW = typeof window !== 'undefined'
const HAS_DOCUMENT = typeof document !== 'undefined'

// Throttle attention-driven refetches per task. Without this, every
// visibilitychange event during an AI stream fires a wave of refetches.
const ATTENTION_THROTTLE_MS = 10 * 1000

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
  const lastAttentionAt = useRef(0)

  taskRef.current = task

  runTaskRef.current = async (opts = {}) => {
    if (!enabled || runningRef.current) return
    if (pauseWhenHidden && HAS_DOCUMENT && document.hidden) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    // Skip while an AI stream is in flight; the stream itself is the user's
    // visible activity and unrelated background refetches just flicker the UI.
    if (opts.fromAttention && isStreamingActive()) return

    runningRef.current = true
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    abortRef.current = controller

    try {
      const startTransition =
        typeof reactStartTransition === 'function' ? reactStartTransition : undefined

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
        const now = Date.now()
        if (now - lastAttentionAt.current < ATTENTION_THROTTLE_MS) return
        lastAttentionAt.current = now
        void runTaskRef.current({ fromAttention: true })
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
