import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/responsive.css'
import App from './App.jsx'
import { installApiFetchShim } from './lib/http'
import { applyGlobalTheme } from './lib/appearance'
import { initTelemetry, captureWebVital } from './lib/telemetry'
import { reportWebVitals } from './lib/performance'
import { startWebVitals } from './lib/webVitals'
import { consumePendingRoleReload } from './lib/pendingRoleReload'
import { clearFetchCache } from './lib/useFetch'

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
if ('serviceWorker' in navigator && !window.__SH_NATIVE__) {
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
 *   1. Flush the in-memory SWR cache in useFetch so any page still mounted
 *      will get fresh data on its next refetch — prevents the "I see stale
 *      data even after refresh was offered" footgun.
 *   2. Show the refresh banner so the user knows a new version is live.
 */
function handleSwUpdate() {
  try {
    clearFetchCache()
  } catch {
    // Cache flush is best-effort; the banner still matters.
  }
  showUpdateBanner()
}

/** Show a non-intrusive banner prompting the user to refresh for the latest version. */
function showUpdateBanner() {
  // Don't show if one is already visible
  if (document.getElementById('sh-update-banner')) return

  const banner = document.createElement('div')
  banner.id = 'sh-update-banner'
  banner.setAttribute('role', 'alert')
  banner.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
    'z-index:99999;background:var(--sh-slate-800);color:var(--sh-slate-50);padding:12px 20px;border-radius:12px;' +
    'box-shadow:0 8px 30px rgba(0,0,0,0.2);display:flex;align-items:center;gap:12px;' +
    'font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:13px;font-weight:500;' +
    'max-width:calc(100vw - 48px);animation:sh-slide-up 0.3s ease-out'

  banner.innerHTML =
    '<span>A new version of StudyHub is available.</span>' +
    '<button onclick="window.location.reload()" style="background:var(--sh-info);color:#fff;border:none;' +
    'border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;' +
    'font-family:inherit;white-space:nowrap">Refresh</button>' +
    '<button onclick="this.parentElement.remove()" style="background:none;border:none;' +
    'color:var(--sh-slate-400);cursor:pointer;font-size:16px;padding:0 4px;line-height:1" aria-label="Dismiss">' +
    'x</button>'

  // Add slide-up animation
  const style = document.createElement('style')
  style.textContent =
    '@keyframes sh-slide-up{from{transform:translateX(-50%) translateY(20px);opacity:0}' +
    'to{transform:translateX(-50%) translateY(0);opacity:1}}'
  document.head.appendChild(style)

  document.body.appendChild(banner)

  // Deliberately NOT auto-dismissing. Previous behavior hid the banner
  // after 30 s, which meant many users missed the update entirely and
  // kept running the old bundle until they tabbed away long enough for
  // the next SW check. The banner now stays until the user clicks
  // Refresh or explicitly dismisses it — they always know a fresh
  // version is waiting.
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
