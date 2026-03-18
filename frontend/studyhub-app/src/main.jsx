import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/responsive.css'
import App from './App.jsx'
import { installApiFetchShim } from './lib/http'
import { initTelemetry } from './lib/telemetry'

initTelemetry()
installApiFetchShim()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
