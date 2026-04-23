/* ═══════════════════════════════════════════════════════════════════════════
 * ComponentErrorBoundary.jsx -- Reusable error boundary for component errors
 *
 * Class-based React error boundary that catches render errors in child
 * components and displays a friendly inline fallback UI with a "Try again"
 * button to reset error state.
 *
 * Usage:
 *   <ComponentErrorBoundary name="Chat Panel">
 *     <MyComponent />
 *   </ComponentErrorBoundary>
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Component } from 'react'

export default class ComponentErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[${this.props.name || 'Component'}] Render error:`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '24px 20px',
            borderRadius: 14,
            border: '1px solid var(--sh-danger-border)',
            background: 'var(--sh-danger-bg)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--sh-danger-text)',
              marginBottom: 6,
            }}
          >
            {this.props.name ? `${this.props.name} failed to load` : 'Something went wrong'}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--sh-muted)',
              marginBottom: 14,
            }}
          >
            An unexpected error occurred. You can try reloading this section.
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--sh-brand)',
              color: 'var(--sh-surface)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
