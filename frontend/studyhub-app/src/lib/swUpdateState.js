// src/lib/swUpdateState.js
//
// Tracks whether the service worker has signaled that a new app version is
// installed and ready. Used to drive a silent auto-reload on the next safe
// moment (route change, tab return) — matching the Facebook / Instagram /
// GitHub pattern where users never see a "Refresh" banner.
//
// The module is intentionally small and dependency-free so it can be
// imported from both the React tree (App.jsx, hooks) and the early-boot
// service-worker registration block in main.jsx without pulling React
// into the boot path.
//
// Usage from main.jsx (on SW_UPDATED):
//     import { markSwUpdateAvailable } from './lib/swUpdateState'
//     markSwUpdateAvailable()
//
// Usage from a React component:
//     import { isSwUpdateAvailable, subscribeSwUpdate } from './lib/swUpdateState'
//     const [pending, setPending] = useState(isSwUpdateAvailable())
//     useEffect(() => subscribeSwUpdate(setPending), [])

const listeners = new Set()

let updateAvailable = false
let pendingSince = 0
let reloadTriggered = false

/** Mark that a new SW version is installed and ready to take over. */
export function markSwUpdateAvailable() {
  if (updateAvailable) return
  updateAvailable = true
  pendingSince = Date.now()
  for (const listener of listeners) {
    try {
      listener(true)
    } catch {
      // Listener errors are isolated — the next listener still runs.
    }
  }
}

/** True when the SW has signaled that a new version is ready. */
export function isSwUpdateAvailable() {
  return updateAvailable
}

/** Milliseconds since the update was first flagged (0 if no update). */
export function swUpdatePendingAgeMs() {
  return updateAvailable ? Date.now() - pendingSince : 0
}

/**
 * Subscribe to update-state changes. The callback is invoked once with the
 * current state synchronously, then again whenever `markSwUpdateAvailable`
 * is called. Returns an unsubscribe function.
 */
export function subscribeSwUpdate(callback) {
  if (typeof callback !== 'function') return () => {}
  listeners.add(callback)
  try {
    callback(updateAvailable)
  } catch {
    // Ignore initial-invoke errors — keeps subscription semantics simple.
  }
  return () => {
    listeners.delete(callback)
  }
}

/**
 * Has a reload already been issued for this page-load? Multiple
 * triggers (route change + visibility + subscription) can fire before
 * the browser tears down the JS context; the consumer uses this flag
 * to guarantee it calls `window.location.reload()` at most once per
 * page-load.
 */
export function hasReloadBeenTriggered() {
  return reloadTriggered
}

/** Mark the page-load-level reload guard so subsequent calls no-op. */
export function markReloadTriggered() {
  reloadTriggered = true
}

/**
 * Test-only: reset the module to its initial state. Never call from
 * production code. Exported separately from the main API so typos can't
 * silently wipe state in production.
 */
export function _resetForTests() {
  updateAvailable = false
  pendingSince = 0
  reloadTriggered = false
  listeners.clear()
}
