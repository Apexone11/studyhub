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

// Notes offline PATCH-replay outbox (merged from sw-notes.js).
// Intercepts PATCH /api/notes/<id>, enqueues on network failure,
// drains via Background Sync tag 'note-save-retry'.
const NOTES_OUTBOX_DB = 'studyhub-notes-sw'
const NOTES_OUTBOX_STORE = 'outbox'
const NOTES_PATCH_RE = /^\/api\/notes\/[^/]+$/

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

  // Notes offline PATCH-replay: intercept PATCH /api/notes/<id> before any
  // other routing so the outbox can absorb failed writes.
  if (request.method === 'PATCH') {
    let patchUrl
    try {
      patchUrl = new URL(request.url)
    } catch {
      patchUrl = null
    }
    if (patchUrl && NOTES_PATCH_RE.test(patchUrl.pathname)) {
      event.respondWith(handleNotesPatch(request))
      return
    }
  }

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

  // Skip cross-origin requests. The browser enforces CSP `connect-src`
  // against the SW's internal `fetch()` call, so if we intercept a
  // request to a host that's allowed by `img-src` / `style-src` / etc.
  // but not by `connect-src`, the SW's fetch fails and — if both network
  // and cache return nothing — `event.respondWith(undefined)` throws
  // "Failed to convert value to 'Response'". Letting the browser handle
  // cross-origin requests natively side-steps both problems.
  if (url.origin !== self.location.origin) return

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

  // A Response the browser can render as "network error". Every branch's
  // final `.then` or `.catch` resolves to one of these instead of null so
  // `event.respondWith(...)` never receives a non-Response value.
  const networkErrorResponse = () => new Response('', { status: 504, statusText: 'SW fallback' })

  // ── Hashed assets (/assets/*): cache-first (immutable) ────────────────
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          if (response.ok) safeCachePut(request, response.clone())
          return response
        }).catch(() => cached || networkErrorResponse())
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
        }).catch(() => cached || networkErrorResponse())
      )
    )
    trimCache(CACHE_NAME, MAX_CACHED_FONTS + MAX_CACHED_IMAGES + MAX_CACHED_PAGES)
    return
  }

  // ── Images: stale-while-revalidate ────────────────────────────────────
  if (isImage(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) safeCachePut(request, response.clone())
            return response
          })
          .catch(() => cached || networkErrorResponse())

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
      .catch(() =>
        caches.match(request).then((cached) => cached || networkErrorResponse()),
      ),
  )
})

/* ── Message handler ────────────────────────────────────────────────────── */

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return
  // Allow the frontend to trigger skipWaiting from a "Update available" toast
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  // Clear the notes offline outbox on logout so the next user on a shared
  // browser doesn't inherit pending note-save requests.
  if (data.type === 'CLEAR_NOTES_OUTBOX') {
    event.waitUntil(clearNotesOutbox())
    return
  }
})

async function clearNotesOutbox() {
  try {
    const db = await openNotesOutbox()
    const tx = db.transaction(NOTES_OUTBOX_STORE, 'readwrite')
    // The wrapper's inner store object does not expose a clear() method,
    // so drain by listing ids and deleting one by one. Best-effort.
    const all = await tx.store.getAll()
    for (const entry of all) {
      if (entry && entry.id != null) {
        try {
          await tx.store.delete(entry.id)
        } catch {
          /* skip */
        }
      }
    }
    await tx.done
  } catch {
    /* best-effort cleanup */
  }
}

/* ── Notes offline PATCH-replay ─────────────────────────────────────────────
 * Merged from the previously-unregistered `sw-notes.js`. Contract:
 *   - On network failure for PATCH /api/notes/<id>, enqueue the request in
 *     IndexedDB (studyhub-notes-sw / outbox) and return 202.
 *   - On Background Sync 'note-save-retry', replay FIFO with trigger
 *     'sw-replay'. Delete entries on 2xx/202 (notify 'sw-saved') or 409
 *     (notify 'sw-conflict'). Leave other statuses for the next sync.
 *   - Server body contract preserved:
 *       { title, content, baseRevision, saveId, contentHash, trigger }
 *   - Client message contract:
 *       { type: 'sw-saved',    noteId, revision }
 *       { type: 'sw-conflict', noteId }
 * ─────────────────────────────────────────────────────────────────────────── */

async function handleNotesPatch(req) {
  const cloned = req.clone()
  let body = ''
  try {
    body = await cloned.text()
  } catch {
    /* unreadable */
  }
  try {
    const res = await fetch(req)
    return res
  } catch {
    try {
      const db = await openNotesOutbox()
      const tx = db.transaction(NOTES_OUTBOX_STORE, 'readwrite')
      await tx.store.add({
        url: req.url,
        body,
        headers: Array.from(req.headers.entries()),
        enqueuedAt: Date.now(),
      })
      await tx.done
      if ('sync' in self.registration) {
        try {
          await self.registration.sync.register('note-save-retry')
        } catch {
          /* unsupported */
        }
      }
    } catch {
      /* IDB write failed — best-effort */
    }
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'note-save-retry') return
  event.waitUntil(drainNotesOutbox())
})

async function drainNotesOutbox() {
  const db = await openNotesOutbox()
  const tx = db.transaction(NOTES_OUTBOX_STORE, 'readwrite')
  const all = await tx.store.getAll()
  for (const entry of all) {
    try {
      const headers = new Headers(entry.headers)
      let parsed = {}
      try {
        parsed = JSON.parse(entry.body || '{}')
      } catch {
        /* bad payload, skip */
        continue
      }
      parsed.trigger = 'sw-replay'
      const res = await fetch(entry.url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(parsed),
        credentials: 'include',
      })
      if (res.ok || res.status === 202) {
        await tx.store.delete(entry.id)
        notifyNotesClients({
          type: 'sw-saved',
          noteId: extractNotesId(entry.url),
          revision: await tryNotesRevision(res),
        })
      } else if (res.status === 409) {
        // Server has a newer revision. Drop the queued entry and let the
        // active tab discover the conflict on its next save attempt.
        await tx.store.delete(entry.id)
        notifyNotesClients({
          type: 'sw-conflict',
          noteId: extractNotesId(entry.url),
        })
      }
      // Other non-OK statuses (5xx) leave the entry; will retry on next sync.
    } catch {
      /* network still down or transient error — leave entry, retry next time */
    }
  }
  await tx.done
}

function extractNotesId(url) {
  try {
    const parts = new URL(url).pathname.split('/')
    return parts[parts.length - 1]
  } catch {
    return null
  }
}

async function tryNotesRevision(res) {
  try {
    const j = await res.clone().json()
    return j.revision ?? null
  } catch {
    return null
  }
}

async function notifyNotesClients(message) {
  try {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    clients.forEach((c) => c.postMessage(message))
  } catch {
    /* swallow */
  }
}

function openNotesOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOTES_OUTBOX_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(NOTES_OUTBOX_STORE)) {
        db.createObjectStore(NOTES_OUTBOX_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      resolve({
        transaction(_storeName, mode) {
          const tx = db.transaction(NOTES_OUTBOX_STORE, mode || 'readonly')
          const store = tx.objectStore(NOTES_OUTBOX_STORE)
          return {
            store: {
              add(record) {
                return notesReqToPromise(store.add(record))
              },
              delete(id) {
                return notesReqToPromise(store.delete(id))
              },
              getAll() {
                return notesReqToPromise(store.getAll())
              },
            },
            get done() {
              return new Promise((r, j) => {
                tx.oncomplete = () => r()
                tx.onerror = () => j(tx.error)
              })
            },
          }
        },
      })
    }
    req.onerror = () => reject(req.error)
  })
}

function notesReqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
