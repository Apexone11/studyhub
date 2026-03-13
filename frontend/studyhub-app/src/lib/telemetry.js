import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'

let posthogInitialized = false
let sentryInitialized = false
let clarityInitialized = false
let lastTrackedPath = ''

function parseSampleRate(value, fallbackValue) {
  const parsedValue = Number.parseFloat(value)

  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    return fallbackValue
  }

  return parsedValue
}

function initClarity(projectId) {
  if (typeof window === 'undefined' || !projectId || clarityInitialized) {
    return
  }

  window.clarity =
    window.clarity ||
    function clarityQueue() {
      ;(window.clarity.q = window.clarity.q || []).push(arguments)
    }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`
  document.head.appendChild(script)

  clarityInitialized = true
}

export function initTelemetry() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN
  const sentryTraceRate = parseSampleRate(
    import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
    0.1
  )

  if (sentryDsn && !sentryInitialized) {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: sentryTraceRate,
      environment: import.meta.env.MODE
    })

    sentryInitialized = true
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY

  if (posthogKey && !posthogInitialized) {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false,
      persistence: 'localStorage',
      person_profiles: 'identified_only'
    })

    posthogInitialized = true
  }

  initClarity(import.meta.env.VITE_CLARITY_PROJECT_ID)
}

export function trackPageView(pathname) {
  if (!pathname || pathname === lastTrackedPath) {
    return
  }

  if (posthogInitialized) {
    posthog.capture('$pageview', { pathname })
  }

  if (sentryInitialized) {
    Sentry.addBreadcrumb({
      category: 'navigation',
      message: pathname,
      level: 'info'
    })
  }

  lastTrackedPath = pathname
}

export function identifyAuthenticatedUser(user) {
  if (!user || typeof user !== 'object') {
    return
  }

  const userId = user.id !== undefined && user.id !== null ? String(user.id) : undefined
  const username = typeof user.username === 'string' ? user.username : undefined

  if (posthogInitialized && userId) {
    const traits = username ? { username } : undefined
    posthog.identify(userId, traits)
  }

  if (sentryInitialized) {
    Sentry.setUser({
      id: userId,
      username
    })
  }
}

export function clearAuthenticatedUser() {
  if (posthogInitialized) {
    posthog.reset()
  }

  if (sentryInitialized) {
    Sentry.setUser(null)
  }
}
