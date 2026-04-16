import { Component } from 'react'
import * as JoyrideModule from 'react-joyride'
import { captureComponentError } from '../lib/telemetry'

// react-joyride v3's ESM build uses a re-export pattern that rolldown
// (Vite 8 bundler) cannot resolve as a default import. Namespace import
// + fallback handles both bundler quirks and version differences.
const Joyride = JoyrideModule.default || JoyrideModule

/**
 * Wraps react-joyride in an error boundary so that React 19 incompatibilities
 * (findDOMNode removal, etc.) don't crash the entire page.
 * The tutorial is a nice-to-have — if it fails, the page still works.
 */
class JoyrideErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    captureComponentError(error, {
      surface: 'joyride-error-boundary',
      componentStack: info?.componentStack,
    })
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export default function SafeJoyride(props) {
  return (
    <JoyrideErrorBoundary>
      <Joyride {...props} />
    </JoyrideErrorBoundary>
  )
}
