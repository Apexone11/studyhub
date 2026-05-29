import { Component, Suspense, lazy } from 'react'
import { captureComponentError } from '../lib/telemetry'

// react-joyride v3's ESM build uses a re-export pattern that rolldown
// (Vite 8 bundler) cannot resolve as a default import. Normalize
// default-or-namespace inside the dynamic import. Lazy so the ~825K
// `onboarding` chunk is fetched only when a tour actually runs — not
// eagerly modulepreloaded onto the /feed landing chunk and 10 other routes.
const Joyride = lazy(() => import('react-joyride').then((m) => ({ default: m.default || m })))

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
  // props.run is always supplied by useTutorial.joyrideProps and already folds
  // in steps.length > 0. Early-return when no tour is running so the dynamic
  // import never fires for returning / tutorial-disabled users.
  if (!props.run) return null
  return (
    <JoyrideErrorBoundary>
      <Suspense fallback={null}>
        <Joyride {...props} />
      </Suspense>
    </JoyrideErrorBoundary>
  )
}
