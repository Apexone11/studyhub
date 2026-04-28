/**
 * prefetch.js -- Hover-triggered data prefetching for sidebar navigation
 *
 * When a user hovers over a sidebar link, prefetch the data that page will need.
 * The fetched data is cached via useFetch's SWR mechanism, so it's instantly
 * available when they click.
 *
 * Usage:
 *   import { prefetchForRoute } from './prefetch'
 *   <Link onMouseEnter={() => prefetchForRoute('/feed')} to="/feed" />
 */

import { API } from '../config'
import { cache } from './useFetch'

// Map route paths to their primary API endpoints
const ROUTE_TO_API = {
  '/feed': '/api/feed',
  '/sheets': '/api/sheets',
  '/notes': '/api/notes',
  '/messages': '/api/messages/conversations',
  '/study-groups': '/api/study-groups',
  '/announcements': '/api/announcements',
  '/my-courses': '/api/courses/enrolled',
  // '/tests' is intentionally NOT prefetched: the page is currently a v2
  // teaser with no backend route. Mapping it to '/api/tests' here would
  // hit a 404 every time a user hovers Practice Tests in the sidebar.
  '/ai': '/api/ai/conversations',
  '/library': '/api/library/search?language=en',
  '/users/:username': null, // Profile routes are dynamic; not prefetched
}

// Debounce map: tracks the last prefetch time for each path
const prefetchedAt = new Map()
const DEBOUNCE_MS = 30 * 1000 // 30 seconds

/**
 * Prefetch data for a given API path.
 * Uses requestIdleCallback to avoid blocking the main thread.
 * Updates the useFetch cache so the data is instantly available.
 * @param {string} apiPath - The API endpoint path (e.g., '/api/feed')
 */
export function prefetch(apiPath) {
  // Debounce: skip if we've prefetched this path recently
  const lastTime = prefetchedAt.get(apiPath)
  if (lastTime && Date.now() - lastTime < DEBOUNCE_MS) {
    return
  }

  // Schedule fetch on idle callback with setTimeout fallback
  const fetchFn = () => {
    fetch(`${API}${apiPath}`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json()
        return null
      })
      .then((data) => {
        if (data) {
          // Update the useFetch cache so the hook will use this data
          cache.set(apiPath, { data, timestamp: Date.now() })
        }
      })
      .catch(() => {
        // Silent failure: prefetch is fire-and-forget
      })
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(fetchFn, { timeout: 2000 })
  } else {
    setTimeout(fetchFn, 0)
  }

  // Record the prefetch time
  prefetchedAt.set(apiPath, Date.now())
}

/**
 * Prefetch data for a given route path.
 * Looks up the API path and calls prefetch().
 * Gracefully skips if the route does not have a known API mapping
 * (e.g., dynamic routes like /users/:username).
 * @param {string} routePath - The route path (e.g., '/feed')
 */
export function prefetchForRoute(routePath) {
  const apiPath = ROUTE_TO_API[routePath]
  if (apiPath && apiPath !== null) {
    prefetch(apiPath)
  }
}

export function _resetPrefetchDebounceForTests() {
  prefetchedAt.clear()
}
