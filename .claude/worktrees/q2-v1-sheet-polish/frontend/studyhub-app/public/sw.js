const CACHE_NAME = 'studyhub-v1.7.0'

// Install: skip waiting to activate immediately on deploy.
// We do NOT pre-cache index.html — it must always come from the network
// so browsers get the latest chunk references after each deploy.
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  )
  self.clients.claim()
})

// Safe cache helper — cache.put() throws for non-http(s) schemes (e.g. chrome-extension://).
// Always wrap in try/catch so a caching failure never crashes the fetch handler.
function safeCachePut(cacheName, request, response) {
  try {
    const url = new URL(request.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    caches.open(cacheName).then((cache) => cache.put(request, response)).catch(() => {})
  } catch {
    // Ignore — caching is best-effort
  }
}

// Fetch strategy:
// - Non-http(s) schemes: pass through (never cache)
// - API requests: network-only (no caching)
// - Navigation (HTML): network-first with offline fallback
// - Hashed assets (/assets/*): cache-first (immutable by content hash)
// - Other static files: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip non-http(s) schemes (chrome-extension://, data:, blob:, etc.)
  // These cannot be cached and calling cache.put() on them throws.
  try {
    const url = new URL(request.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  } catch {
    return
  }

  // API requests: always network, no caching
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'You appear to be offline.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // Navigation requests (HTML pages): network-first so deploys take effect immediately
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) safeCachePut(CACHE_NAME, request, response.clone())
          return response
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          )
        )
    )
    return
  }

  // Hashed assets under /assets/ are immutable — cache-first
  if (request.url.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) safeCachePut(CACHE_NAME, request, response.clone())
            return response
          })
      )
    )
    return
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) safeCachePut(CACHE_NAME, request, response.clone())
        return response
      })
      .catch(() => caches.match(request))
  )
})
