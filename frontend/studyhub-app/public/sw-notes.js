/**
 * Notes hardening v2 — offline PATCH replay Service Worker (INTEGRATION-PENDING).
 *
 * ── STATUS ──────────────────────────────────────────────────────────────────
 * This file is NOT registered. StudyHub already ships a primary Service Worker
 * at `public/sw.js` (registered at site root by `src/main.jsx`). Browsers only
 * allow a single active Service Worker per scope, and splitting scopes would
 * make the primary SW unable to see /api/notes requests from pages under `/`.
 *
 * Integration path (when the notes-hardening flag graduates beyond gated rollout):
 *   1. Port the `fetch` handler below into `public/sw.js` inside its existing
 *      `self.addEventListener('fetch', ...)` block, gated by method+path regex
 *      so it only runs for PATCH /api/notes/<id>.
 *   2. Port the `sync` handler + `drainOutbox` + `openOutbox` helpers verbatim
 *      into `public/sw.js` (they are independent of the existing caching logic).
 *   3. Inside the React client, gate any SW-enhancement UI on
 *      `isNotesHardeningEnabled()` from
 *      `./pages/notes/useNotesHardeningFlag.js` and on `navigator.serviceWorker
 *      .controller` being present.
 *   4. Listen for `{ type: 'sw-saved' | 'sw-conflict', noteId, revision }`
 *      messages from the SW to reconcile local draft state after replay.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 * Scope: only intercepts PATCH requests to /api/notes/<id>. All other requests
 * pass through unmodified.
 *
 * On network failure: enqueue the PATCH in a dedicated outbox IndexedDB
 * (`studyhub-notes-sw` / `outbox`). Register a 'note-save-retry' background
 * sync. Drain outbox FIFO when the sync event fires. Each replay sends with
 * `trigger: 'sw-replay'`; the original `saveId` is preserved so the server
 * idempotently dedups (PATCH /api/notes/:id returns 202 with prior result for
 * a repeated saveId).
 *
 * Server body contract: { title, content, baseRevision, saveId, contentHash, trigger }.
 *
 * Message contract to clients:
 *   { type: 'sw-saved',    noteId, revision }  — replay succeeded
 *   { type: 'sw-conflict', noteId }            — server returned 409; drop entry
 * ────────────────────────────────────────────────────────────────────────────
 */

const OUTBOX_DB = 'studyhub-notes-sw'
const OUTBOX_STORE = 'outbox'
const PATCH_RE = /^\/api\/notes\/[^/]+$/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'PATCH') return
  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (!PATCH_RE.test(url.pathname)) return
  event.respondWith(handlePatch(req))
})

async function handlePatch(req) {
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
      const db = await openOutbox()
      const tx = db.transaction(OUTBOX_STORE, 'readwrite')
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
  event.waitUntil(drainOutbox())
})

async function drainOutbox() {
  const db = await openOutbox()
  const tx = db.transaction(OUTBOX_STORE, 'readwrite')
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
        notifyClients({
          type: 'sw-saved',
          noteId: extractNoteId(entry.url),
          revision: await tryRevision(res),
        })
      } else if (res.status === 409) {
        // Server has a newer revision. Drop the queued entry and let the
        // active tab discover the conflict on its next save attempt.
        await tx.store.delete(entry.id)
        notifyClients({ type: 'sw-conflict', noteId: extractNoteId(entry.url) })
      }
      // Other non-OK statuses (5xx) leave the entry; will retry on next sync.
    } catch {
      /* network still down or transient error — leave entry, retry next time */
    }
  }
  await tx.done
}

function extractNoteId(url) {
  try {
    const parts = new URL(url).pathname.split('/')
    return parts[parts.length - 1]
  } catch {
    return null
  }
}

async function tryRevision(res) {
  try {
    const j = await res.clone().json()
    return j.revision ?? null
  } catch {
    return null
  }
}

async function notifyClients(message) {
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

function openOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      resolve({
        transaction(_storeName, mode) {
          const tx = db.transaction(OUTBOX_STORE, mode || 'readonly')
          const store = tx.objectStore(OUTBOX_STORE)
          return {
            store: {
              add(record) {
                return reqToPromise(store.add(record))
              },
              delete(id) {
                return reqToPromise(store.delete(id))
              },
              getAll() {
                return reqToPromise(store.getAll())
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

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
