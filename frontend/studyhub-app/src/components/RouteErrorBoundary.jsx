import { Component } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { captureRouteCrash } from '../lib/telemetry'

class RouteErrorBoundaryInner extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, eventId: '' }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    const eventId = captureRouteCrash(error, {
      route: this.props.routeKey,
      componentStack: errorInfo?.componentStack || '',
    })

    this.setState({ eventId })
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
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
          background: '#edf0f5',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 'min(92vw, 520px)',
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)',
            padding: '28px',
          }}
        >
          <h1 style={{ margin: '0 0 10px', fontSize: 24, color: '#0f172a' }}>
            This page crashed.
          </h1>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
            StudyHub recovered the app shell, but this route hit a runtime error. You can retry the route or jump back to a stable page.
          </p>
          {this.state.eventId ? (
            <p style={{ margin: '0 0 18px', fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
              Reference ID: <strong>{this.state.eventId}</strong>
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Retry Route
            </button>
            <button
              type="button"
              onClick={() => this.props.navigate('/feed')}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#475569',
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
