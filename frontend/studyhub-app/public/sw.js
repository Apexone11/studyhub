const CACHE_NAME = 'studyhub-v1'
const STATIC_ASSETS = ['/', '/index.html']

// Install: cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
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

// Fetch: Network-first for API (no caching), Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // API requests: always go to network, no caching (avoids serving
  // stale authenticated data across different user sessions)
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'You appear to be offline.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  } else {
    // Static assets: cache-first, fall back to network
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone))
            }
            return response
          })
      )
    )
  }
})
