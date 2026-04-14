/**
 * webVitals.js -- Capture Core Web Vitals and send to PostHog.
 * Uses web-vitals library. Only runs in production. Respects opt-out.
 */
import { trackClientEvent, CLIENT_EVENTS } from './analytics'

export function startWebVitals() {
  if (import.meta.env?.DEV) return

  import('web-vitals')
    .then(({ onLCP, onINP, onCLS }) => {
      const send = (metric) => {
        trackClientEvent(CLIENT_EVENTS.WEB_VITALS, {
          metric: metric.name,
          value: Math.round(metric.value * 100) / 100,
          rating: metric.rating,
          route: window.location.pathname,
          deviceType:
            window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
        })
      }
      onLCP(send)
      onINP(send)
      onCLS(send)
    })
    .catch(() => {
      // web-vitals not available -- skip silently
    })
}
