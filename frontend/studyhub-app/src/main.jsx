import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/responsive.css'
import App from './App.jsx'
import { installApiFetchShim } from './lib/http'
import { initTelemetry, captureWebVital } from './lib/telemetry'
import { reportWebVitals } from './lib/performance'

// Telemetry + fetch shim must never block React mount
try { initTelemetry() } catch { /* logged inside initTelemetry */ }
try { installApiFetchShim() } catch { /* best-effort */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
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
  const BLANK_CHECK_DELAY = 6000  // Wait 6s after load for app to mount
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
