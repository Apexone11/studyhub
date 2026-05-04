/**
 * Stream activity tracker - module-level refcount of active SSE streams.
 *
 * useFetch's focus revalidation, useLivePolling, and any other periodic
 * background fetcher checks `isStreamingActive()` and skips work while
 * a stream is in flight. This eliminates the visible flicker on Feed
 * and other widgets when the user is mid-conversation with Hub AI.
 *
 * A refcount (not a boolean) is used because multiple AI streams may
 * overlap (rare today, possible tomorrow). A 5-minute watchdog ensures
 * the count cannot pin polling off forever if a stream end-event is
 * dropped (network drop, tab close mid-stream, server crash).
 */

let _count = 0
let _watchdog = null
const _listeners = new Set()
const WATCHDOG_MS = 5 * 60 * 1000

function notify() {
  for (const fn of _listeners) {
    try {
      fn(_count > 0)
    } catch {
      // listener errors must not affect other listeners
    }
  }
}

function startWatchdog() {
  if (_watchdog) return
  _watchdog = setTimeout(() => {
    if (_count > 0) {
      _count = 0
      notify()
    }
    _watchdog = null
  }, WATCHDOG_MS)
  if (typeof _watchdog?.unref === 'function') _watchdog.unref()
}

function clearWatchdog() {
  if (_watchdog) {
    clearTimeout(_watchdog)
    _watchdog = null
  }
}

export function startStreaming() {
  _count += 1
  if (_count === 1) startWatchdog()
  notify()
}

export function stopStreaming() {
  if (_count <= 0) return
  _count -= 1
  if (_count === 0) {
    clearWatchdog()
    notify()
  }
}

export function isStreamingActive() {
  return _count > 0
}

export function resetStreamingState() {
  _count = 0
  clearWatchdog()
  notify()
}

/** Subscribe to stream-active changes. Returns an unsubscribe fn. */
export function onStreamingChange(listener) {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}
