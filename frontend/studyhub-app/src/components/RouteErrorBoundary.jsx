import { Component } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { captureRouteCrash } from '../lib/telemetry'

/** Detect chunk load / dynamic import failures caused by stale deploys. */
function isChunkLoadError(error) {
  if (!error) return false
  const name = error.name || ''
  const msg = (error.message || '').toLowerCase()
  // Vite/Webpack chunk failures and generic dynamic import errors
  return name === 'ChunkLoadError'
    || msg.includes('loading chunk')
    || msg.includes('dynamically imported module')
    || msg.includes('failed to fetch dynamically imported module')
    || msg.includes('importing a module script failed')
}

const CHUNK_RELOAD_KEY = 'sh_chunk_reload'

class RouteErrorBoundaryInner extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, eventId: '' }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    // Auto-refresh once on chunk load failure (stale deploy).
    // sessionStorage flag prevents infinite reload loops.
    if (isChunkLoadError(error)) {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY)
      if (!alreadyReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return
      }
      // Already reloaded once — clear flag and fall through to error UI
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    }

    const eventId = captureRouteCrash(error, {
      route: this.props.routeKey,
      componentStack: errorInfo?.componentStack || '',
    })

    this.setState({ eventId })
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      this.setState({ error: null, eventId: '' })
    }
  }

  handleRetry = () => {
    this.setState({ error: null, eventId: '' })
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: 'var(--sh-soft, #edf0f5)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 'min(92vw, 520px)',
            background: 'var(--sh-surface, #fff)',
            borderRadius: 16,
            border: '1px solid var(--sh-border, #e2e8f0)',
            boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)',
            padding: '28px',
          }}
        >
          <h1 style={{ margin: '0 0 10px', fontSize: 24, color: 'var(--sh-slate-900, #0f172a)' }}>
            {isChunkLoadError(this.state.error) ? 'Update available' : 'This page crashed.'}
          </h1>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--sh-slate-500, #64748b)', lineHeight: 1.7 }}>
            {isChunkLoadError(this.state.error)
              ? 'StudyHub was updated since you last loaded the page. A refresh should fix this.'
              : 'StudyHub recovered the app shell, but this route hit a runtime error. You can retry the route or jump back to a stable page.'}
          </p>
          {this.state.eventId ? (
            <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--sh-slate-600, #475569)', lineHeight: 1.7 }}>
              Reference ID: <strong>{this.state.eventId}</strong>
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isChunkLoadError(this.state.error) ? (
              <button
                type="button"
                onClick={() => { sessionStorage.removeItem(CHUNK_RELOAD_KEY); window.location.reload() }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--sh-brand)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Refresh Page
              </button>
            ) : (
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--sh-brand)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Retry Route
              </button>
            )}
            <button
              type="button"
              onClick={() => this.props.navigate('/feed')}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: 'var(--sh-surface, #fff)',
                color: 'var(--sh-slate-600, #475569)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Go To Feed
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default function RouteErrorBoundary({ children }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <RouteErrorBoundaryInner
      resetKey={`${location.pathname}${location.search}`}
      routeKey={`${location.pathname}${location.search}`}
      navigate={navigate}
    >
      {children}
    </RouteErrorBoundaryInner>
  )
}
