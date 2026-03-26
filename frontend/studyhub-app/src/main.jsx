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
