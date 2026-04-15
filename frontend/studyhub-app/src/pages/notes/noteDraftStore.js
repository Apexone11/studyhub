import { openDB } from 'idb'

const DB_NAME = 'studyhub-notes'
const STORE = 'noteDrafts'
const SS_KEY = 'studyhub.noteDrafts.v1'

let dbPromise = null

function db() {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'noteId' })
        }
      },
    }).catch(() => null)
  }
  return dbPromise
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
        await handle.put(STORE, record)
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
        const got = await handle.get(STORE, key)
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
        await handle.delete(STORE, key)
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
        return (await handle.getAll(STORE)) ?? []
      } catch {
        // fall through
      }
    }
    return Object.values(ssRead())
  },

  async _reset() {
    const handle = await db()
    if (handle) {
      try {
        await handle.clear(STORE)
        return
      } catch {
        // fall through
      }
    }
    ssWrite({})
  },
}
