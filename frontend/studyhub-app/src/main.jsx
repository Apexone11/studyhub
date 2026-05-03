import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/responsive.css'
import './styles/motion.css'
import App from './App.jsx'
import { installApiFetchShim } from './lib/http'
import { applyGlobalTheme } from './lib/appearance'
import { initTelemetry, captureWebVital } from './lib/telemetry'
import { reportWebVitals } from './lib/performance'
import { startWebVitals } from './lib/webVitals'
import { consumePendingRoleReload } from './lib/pendingRoleReload'
import { clearFetchCache } from './lib/useFetch'
import { markSwUpdateAvailable } from './lib/swUpdateState'

try {
  consumePendingRoleReload()
} catch {
  /* best-effort */
}

// Telemetry + fetch shim must never block React mount
try {
  initTelemetry()
} catch {
  /* logged inside initTelemetry */
}
try {
  installApiFetchShim()
} catch {
  /* best-effort */
}
try {
  applyGlobalTheme()
} catch {
  /* best-effort */
}
// Apply persisted accessibility preferences before first paint so the
// user never sees a flash of focus-ring or animation that they
// previously turned off in Settings → Accessibility.
try {
  const focusRing = localStorage.getItem('studyhub.a11y.focusRing')
  if (focusRing === 'false') document.documentElement.dataset.focusRing = 'off'
  const reducedMotion = localStorage.getItem('studyhub.a11y.reducedMotion')
  if (reducedMotion === 'true') document.documentElement.dataset.reducedMotion = 'on'
} catch {
  /* private mode — preferences just won't apply this session */
}
try {
  startWebVitals()
} catch {
  /* best-effort */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for offline support and update detection.
// Pattern used by GitHub, Vercel, Shopify: detect new SW, show update toast.
// Skip on Capacitor native shell — native apps update through the Play Store.
//
// Skip in dev too. Vite serves chunks with content-hashed URLs that change
// on every restart; an SW cache from a previous dev session (or worse, a
// previous prod visit on the same hostname) intercepts requests and
// returns stale chunks, producing the classic "white screen + 504 +
// blocked:other" symptom on the next dev boot. Anyone who needs to test
// the SW itself can flip `import.meta.env.PROD` locally or run
// `npm run build && npm run preview`.
if ('serviceWorker' in navigator && !window.__SH_NATIVE__ && import.meta.env.PROD) {
  // Belt-and-suspenders: if a dev session previously installed an SW
  // before this guard landed, eagerly unregister it on dev boot so the
  // user doesn't have to manually clear site data.
} else if (
  'serviceWorker' in navigator &&
  !import.meta.env.PROD &&
  typeof navigator.serviceWorker.getRegistrations === 'function'
) {
  navigator.serviceWorker
    .getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {})
}
if ('serviceWorker' in navigator && !window.__SH_NATIVE__ && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Poll for updates every 10 minutes. This used to be 60 min, which
        // meant a deploy could take up to an hour to reach an active user
        // — well off-pace from what people expect on Facebook / Instagram /
        // GitHub-grade apps. 10 min is the sweet spot: frequent enough
        // that people see fixes within one cache-warm window, sparing
        // enough that it's not a measurable bandwidth cost.
        setInterval(
          () => {
            registration.update().catch(() => {})
          },
          10 * 60 * 1000,
        )

        // Also check immediately when the user comes back to the tab or
        // reconnects to the network. Most users don't sit on one tab for
        // 10 minutes straight — they tab away and come back, and that's
        // exactly the moment to discover a new deploy.
        function checkForUpdate() {
          registration.update().catch(() => {})
        }
        window.addEventListener('focus', checkForUpdate)
        window.addEventListener('online', checkForUpdate)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate()
        })

        // When a new SW installs, listen for its activation
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            // New SW is active and there was a previous one -- update is ready
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              handleSwUpdate()
            }
          })
        })
      })
      .catch(() => {})

    // Listen for the SW_UPDATED message from the service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        handleSwUpdate()
      }
    })
  })
}

/**
 * Handle a service-worker update event. Two things happen:
 *   1. Flush the in-memory SWR cache in useFetch so any page still
 *      mounted picks up fresh data on its next refetch — prevents the
 *      "I see stale data even after the new SW activated" footgun.
 *   2. Flag the update in `swUpdateState`. The `SwUpdateAutoReloader`
 *      component mounted inside the router reads that flag and silently
 *      reloads on the next safe moment (route change, tab return, or
 *      a 30-minute long-idle fallback). No visible banner — matches the
 *      Facebook / Instagram / GitHub pattern where deploys are
 *      invisible to the user.
 */
function handleSwUpdate() {
  try {
    clearFetchCache()
  } catch {
    // Cache flush is best-effort; the reload still happens either way.
  }
  markSwUpdateAvailable()
}

// Report Web Vitals to telemetry
reportWebVitals((metric) => {
  captureWebVital(metric)
})

// Catch unhandled promise rejections globally so they never cause a blank screen
window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason)
  event.preventDefault()
})

// Blank screen detector — if the root element is empty after the app should have
// mounted, automatically reload the page. This catches edge cases where React
// silently fails without triggering an Error Boundary (e.g., hydration errors,
// runtime exceptions outside component trees, lazy load failures).
;(function initBlankScreenRecovery() {
  const BLANK_CHECK_DELAY = 6000 // Wait 6s after load for app to mount
  const RELOAD_FLAG = 'sh_blank_reload'
  const MAX_RELOADS = 2

  function checkForBlankScreen() {
    const root = document.getElementById('root')
    if (!root) return

    // If root has no visible children, the page is blank
    const hasContent = root.children.length > 0 && root.innerHTML.trim().length > 100

    if (!hasContent) {
      const reloadCount = parseInt(sessionStorage.getItem(RELOAD_FLAG) || '0', 10)
      if (reloadCount < MAX_RELOADS) {
        sessionStorage.setItem(RELOAD_FLAG, String(reloadCount + 1))
        console.warn('[BlankScreenRecovery] Detected blank page, reloading...')
        window.location.reload()
      }
      // If already reloaded max times, stop trying to prevent reload loops
    } else {
      // Page loaded successfully — reset the counter
      sessionStorage.removeItem(RELOAD_FLAG)
    }
  }

  // Check after initial load + generous timeout for lazy components
  if (document.readyState === 'complete') {
    setTimeout(checkForBlankScreen, BLANK_CHECK_DELAY)
  } else {
    window.addEventListener('load', () => {
      setTimeout(checkForBlankScreen, BLANK_CHECK_DELAY)
    })
  }

  // Also check on visibility change (user switches back to tab)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(checkForBlankScreen, 2000)
    }
  })
})()
