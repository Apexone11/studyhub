// Raw IndexedDB implementation of the note-draft store.
//
// Previously this module imported the `idb` package, which is declared in
// package.json but is not present in every developer's node_modules, which
// caused Vite to fail the entire `/notes` route with:
//
//   Failed to resolve import "idb" from "src/pages/notes/noteDraftStore.js"
//
// The `idb` package is a very thin promise wrapper around IndexedDB. We only
// used 5 methods (put/get/delete/getAll/clear), so it is cheaper to inline
// the tiny promise wrapper here than to keep the dependency. This keeps the
// public `draftStore` API identical and preserves the sessionStorage
// fallback for environments without IndexedDB.

const DB_NAME = 'studyhub-notes'
const STORE = 'noteDrafts'
const SS_KEY = 'studyhub.noteDrafts.v1'
const DB_VERSION = 1

let dbPromise = null

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    let request
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'noteId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function db() {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDatabase().catch(() => null)
  }
  return dbPromise
}

function runRequest(database, mode, fn) {
  return new Promise((resolve, reject) => {
    let tx
    try {
      tx = database.transaction(STORE, mode)
    } catch (err) {
      reject(err)
      return
    }
    const store = tx.objectStore(STORE)
    let result
    try {
      const req = fn(store)
      if (req && 'onsuccess' in req) {
        req.onsuccess = () => {
          result = req.result
        }
        req.onerror = () => reject(req.error)
      }
    } catch (err) {
      reject(err)
      return
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function ssRead() {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function ssWrite(obj) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(obj))
  } catch {
    // quota exceeded -- drop silently; draft is best-effort.
  }
}

export const draftStore = {
  async put(noteId, draft) {
    const record = { noteId: String(noteId), ...draft }
    const handle = await db()
    if (handle) {
      try {
        await runRequest(handle, 'readwrite', (store) => store.put(record))
        return
      } catch {
        // fall through to session storage
      }
    }
    const all = ssRead()
    all[record.noteId] = record
    ssWrite(all)
  },

  async get(noteId) {
    const key = String(noteId)
    const handle = await db()
    if (handle) {
      try {
        const got = await runRequest(handle, 'readonly', (store) => store.get(key))
        return got ?? null
      } catch {
        // fall through
      }
    }
    return ssRead()[key] ?? null
  },

  async delete(noteId) {
    const key = String(noteId)
    const handle = await db()
    if (handle) {
      try {
        await runRequest(handle, 'readwrite', (store) => store.delete(key))
        return
      } catch {
        // fall through
      }
    }
    const all = ssRead()
    delete all[key]
    ssWrite(all)
  },

  async listPending() {
    const handle = await db()
    if (handle) {
      try {
        const got = await runRequest(handle, 'readonly', (store) => store.getAll())
        return got ?? []
      } catch {
        // fall through
      }
    }
    return Object.values(ssRead())
  },

  async clearAll() {
    const handle = await db()
    if (handle) {
      try {
        await runRequest(handle, 'readwrite', (store) => store.clear())
        return
      } catch {
        // fall through
      }
    }
    ssWrite({})
  },

  // Test-only alias retained for backward compatibility.
  async _reset() {
    return this.clearAll()
  },
}
