import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import {
  CLARITY_PROJECT_ID,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_SIGNUP_CONVERSION_LABEL,
} from '../config'

let posthogInitialized = false
let sentryInitialized = false
let clarityInitialized = false
let googleAdsInitialized = false
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

  const existingClarityScript = document.querySelector(
    'script[src*="www.clarity.ms/tag/"]'
  )

  if (existingClarityScript) {
    clarityInitialized = true
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

function initGoogleAds(adsId) {
  if (typeof window === 'undefined' || !adsId || googleAdsInitialized) {
    return
  }

  window.dataLayer = window.dataLayer || []
  window.gtag =
    window.gtag ||
    function gtagProxy() {
      window.dataLayer.push(arguments)
    }

  const existingAdsScript = document.querySelector(
    `script[src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}"]`
  )

  if (!existingAdsScript) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`
    document.head.appendChild(script)
  }

  window.gtag('js', new Date())
  window.gtag('config', adsId)
  googleAdsInitialized = true
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

  initClarity(CLARITY_PROJECT_ID)
  initGoogleAds(GOOGLE_ADS_ID)
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

export function trackSignupConversion() {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function' || !GOOGLE_ADS_ID) {
    return
  }

  window.gtag('event', 'sign_up', {
    send_to: GOOGLE_ADS_ID,
    method: 'studyhub',
  })

  if (!GOOGLE_ADS_SIGNUP_CONVERSION_LABEL) {
    return
  }

  window.gtag('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_SIGNUP_CONVERSION_LABEL}`,
  })
}

function createFallbackEventId(surface = 'client') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  return `${surface}-${Date.now().toString(36)}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function captureWebVital(metric) {
  if (posthogInitialized) {
    posthog.capture('web_vital', metric)
  } else if (import.meta.env?.DEV) {
    console.debug('[WebVital]', metric.name, metric.value?.toFixed?.(2), metric.rating)
  }
}

/**
 * Track a product-level event in PostHog.
 * Safe to call at any time — silently no-ops if PostHog isn't initialised.
 *
 * @param {string} name  Event name, e.g. 'sheet_forked'
 * @param {object} [props]  Optional flat properties object
 */
export function trackEvent(name, props = {}) {
  if (!name || typeof name !== 'string') return
  if (posthogInitialized) {
    posthog.capture(name, props)
  } else if (import.meta.env?.DEV) {
    console.debug('[trackEvent]', name, props)
  }
}

export function captureComponentError(error, context = {}) {
  const { surface = 'component-error', ...extra } = context
  let eventId = ''

  if (sentryInitialized) {
    eventId = Sentry.captureException(error, {
      tags: { surface },
      extra,
    }) || ''
  }

  if (!eventId) {
    eventId = createFallbackEventId(surface)
  }

  console.error('Component error captured.', { eventId, surface, ...extra, error })
  return eventId
}

export function captureRouteCrash(error, context = {}) {
  let eventId = ''

  if (sentryInitialized) {
    eventId = Sentry.captureException(error, {
      tags: { surface: 'route-error-boundary' },
      extra: context,
    }) || ''
  }

  if (!eventId) {
    eventId = createFallbackEventId('route')
  }

  console.error('Route render crashed.', { eventId, ...context, error })
  return eventId
}
