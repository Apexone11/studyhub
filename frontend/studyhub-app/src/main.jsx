import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/responsive.css'
import App from './App.jsx'
import { installApiFetchShim } from './lib/http'
import { initTelemetry, captureWebVital } from './lib/telemetry'
import { reportWebVitals } from './lib/performance'

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for offline support and update detection.
// Pattern used by GitHub, Vercel, Shopify: detect new SW, show update toast.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates every 60 minutes
        setInterval(
          () => {
            registration.update().catch(() => {})
          },
          60 * 60 * 1000,
        )

        // When a new SW installs, listen for its activation
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            // New SW is active and there was a previous one -- update is ready
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              showUpdateBanner()
            }
          })
        })
      })
      .catch(() => {})

    // Listen for the SW_UPDATED message from the service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        showUpdateBanner()
      }
    })
  })
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

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    banner.remove()
  }, 30000)
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
