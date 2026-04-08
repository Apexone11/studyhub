/* ═══════════════════════════════════════════════════════════════════════════
 * StudyHub Service Worker v2.0
 *
 * Caching strategy (same pattern used by GitHub, Vercel, Shopify):
 *   - API requests:       Network-only with offline JSON fallback
 *   - Navigation (HTML):  Network-first, cache fallback (always fresh on deploy)
 *   - Hashed assets:      Cache-first (immutable by content-hash filename)
 *   - Fonts / images:     Stale-while-revalidate with size-bounded cache
 *   - Everything else:    Network-first with cache fallback
 *
 * Fixes from v2.0.0:
 *   - Opaque response handling (prevents "Failed to convert value to Response")
 *   - Size-bounded caches prevent unbounded storage growth
 *   - Update notification: posts message to clients when new SW activates
 *   - Proper error handling on all cache operations
 * ═══════════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'studyhub-v2.0'
const MAX_CACHED_PAGES = 30
const MAX_CACHED_IMAGES = 100
const MAX_CACHED_FONTS = 20

/* ── Install ────────────────────────────────────────────────────────────── */

self.addEventListener('install', () => {
  // Skip waiting so the new SW activates immediately after install.
  // This ensures users get the latest caching logic on the next navigation.
  self.skipWaiting()
})

/* ── Activate ───────────────────────────────────────────────────────────── */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      // Notify all open tabs that a new version is active.
      // The frontend can listen for this and show an "Update available" toast.
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME })
        })
      })
    })
  )
  self.clients.claim()
})

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Safely cache a response. Handles all the edge cases that cause
 * "Failed to convert value to 'Response'" errors:
 *   - Non-http(s) schemes (chrome-extension://, blob:, data:)
 *   - Opaque responses (status === 0, cross-origin no-cors)
 *   - Redirect responses that some browsers reject in cache.put()
 */
function safeCachePut(request, response) {
  try {
    const url = new URL(request.url)
    // Only cache http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    // Never cache opaque responses (status 0) -- they can be errors and
    // waste storage. This is the fix for "Failed to convert value to Response".
    if (response.status === 0) return
    // Only cache successful responses
    if (!response.ok) return

    caches.open(CACHE_NAME).then((cache) => {
      cache.put(request, response).catch(() => {})
    }).catch(() => {})
  } catch {
    // Caching is best-effort -- never let it crash the fetch handler
  }
}

/**
 * Trim a cache to a maximum number of entries (LRU-style: oldest first).
 * Prevents unbounded storage growth.
 */
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    if (keys.length > maxItems) {
      // Delete oldest entries (first in the list)
      const toDelete = keys.slice(0, keys.length - maxItems)
      await Promise.all(toDelete.map((key) => cache.delete(key)))
    }
  } catch {
    // Best-effort
  }
}

/** Check if a URL points to a static asset with a content hash (immutable). */
function isHashedAsset(url) {
  // Vite output: /assets/ComponentName-AbCd1234.js
  return url.pathname.startsWith('/assets/')
}

/** Check if a URL is a font file. */
function isFont(url) {
  const path = url.pathname.toLowerCase()
  return path.endsWith('.woff2') || path.endsWith('.woff') || path.endsWith('.ttf')
}

/** Check if a URL is an image. */
function isImage(url) {
  const path = url.pathname.toLowerCase()
  return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')
    || path.endsWith('.gif') || path.endsWith('.webp') || path.endsWith('.svg')
    || path.endsWith('.ico')
}

/* ── Fetch ──────────────────────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only intercept GET requests
  if (request.method !== 'GET') return

  // Skip non-http(s) schemes entirely (chrome-extension://, data:, blob:)
  let url
  try {
    url = new URL(request.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  } catch {
    return
  }

  // ── API requests: network-only with offline fallback ──────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You appear to be offline.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )
    return
  }

  // ── Navigation (HTML): network-first ──────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) safeCachePut(request, response.clone())
          return response
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head>'
              + '<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f1f5f9">'
              + '<div style="text-align:center;padding:40px"><h1 style="font-size:24px;color:#0f172a">You are offline</h1>'
              + '<p style="color:#64748b;margin:12px 0 24px">Check your internet connection and try again.</p>'
              + '<button onclick="location.reload()" style="padding:10px 24px;border-radius:10px;border:none;'
              + 'background:#2563eb;color:#fff;font-size:14px;font-weight:700;cursor:pointer">Retry</button></div></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          )
        )
    )
    // Trim navigation cache periodically
    trimCache(CACHE_NAME, MAX_CACHED_PAGES)
    return
  }

  // ── Hashed assets (/assets/*): cache-first (immutable) ────────────────
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          if (response.ok) safeCachePut(request, response.clone())
          return response
        }).catch(() => cached)
      )
    )
    return
  }

  // ── Fonts: cache-first (rarely change) ────────────────────────────────
  if (isFont(url)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          if (response.ok) safeCachePut(request, response.clone())
          return response
        }).catch(() => cached)
      )
    )
    trimCache(CACHE_NAME, MAX_CACHED_FONTS + MAX_CACHED_IMAGES + MAX_CACHED_PAGES)
    return
  }

  // ── Images: stale-while-revalidate ────────────────────────────────────
  if (isImage(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Return cached immediately, fetch in background to refresh
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) safeCachePut(request, response.clone())
            return response
          })
          .catch(() => cached)

        return cached || networkFetch
      })
    )
    return
  }

  // ── Everything else: network-first with cache fallback ────────────────
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) safeCachePut(request, response.clone())
        return response
      })
      .catch(() => caches.match(request))
  )
})

/* ── Message handler ────────────────────────────────────────────────────── */

self.addEventListener('message', (event) => {
  // Allow the frontend to trigger skipWaiting from a "Update available" toast
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
