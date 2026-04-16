import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { API } from '../../config.js'
import { authHeaders } from '../shared/pageUtils.js'
import { draftStore } from './noteDraftStore.js'
import { reducer, initialState } from './notePersistenceReducer.js'

const DEBOUNCE_MS = 800
const SAFETY_FLUSH_MS = 5000
const CHUNK_THRESHOLD = 64 * 1024
const CHUNK_SIZE = 32 * 1024

function newSaveId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return 'sid-' + Date.now() + '-' + Math.random().toString(16).slice(2)
}

function bytesOf(text) {
  if (typeof Blob !== 'undefined') return new Blob([text ?? '']).size
  return (text ?? '').length
}

export function useNotePersistence(noteId) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const latest = useRef({ title: '', content: '' })
  const baseRevision = useRef(0)
  const pendingSaveId = useRef(null)
  const debounceTimer = useRef(null)
  const safetyTimer = useRef(null)
  const broadcast = useRef(null)
  const stateRef = useRef(state)
  // Guard: don't flush saves until the mount effect has fetched the note's
  // real server revision. Without this, the first debounce-triggered flush
  // sends baseRevision=0, and the server rejects with 409 for any note
  // that has revision >= 1.
  const mountedRef = useRef(false)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const sendChunked = useCallback(async (id, payload) => {
    const text = payload.content ?? ''
    const chunks = []
    for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE))
    let last
    for (let i = 0; i < chunks.length; i++) {
      last = await fetch(`${API}/api/notes/${id}/chunks`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveId: payload.saveId,
          chunkIndex: i,
          chunkCount: chunks.length,
          chunk: chunks[i],
          baseRevision: payload.baseRevision,
          contentHash: payload.contentHash,
          title: payload.title,
        }),
      })
      if (!last.ok && last.status !== 202) return last
    }
    return last
  }, [])

  const flush = useCallback(
    async (trigger) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (safetyTimer.current) clearTimeout(safetyTimer.current)
      safetyTimer.current = null
      if (!mountedRef.current) return // server revision not yet fetched
      if (stateRef.current.status === 'conflict') return
      if (!pendingSaveId.current) return
      const { title, content } = latest.current
      const saveId = pendingSaveId.current

      dispatch({ type: 'SAVE_START' })
      // Skip client-side SHA256 — the server computes its own contentHash
      // via computeContentHash(). Removing the async crypto.subtle.digest
      // call saves ~5-15ms per flush and eliminates a blocking await.
      const payload = {
        title,
        content,
        baseRevision: baseRevision.current,
        saveId,
        contentHash: null,
        trigger,
      }
      try {
        const useChunked = bytesOf(content) > CHUNK_THRESHOLD
        const res = useChunked
          ? await sendChunked(noteId, payload)
          : await fetch(`${API}/api/notes/${noteId}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { ...authHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
        if (res.status === 409) {
          const body = await res.json()
          dispatch({ type: 'CONFLICT_DETECTED', current: body.current, yours: body.yours })
          return
        }
        if (!res.ok && res.status !== 202) {
          dispatch({ type: 'SAVE_FAILURE', error: { code: res.status, message: res.statusText } })
          return
        }
        const body = await res.json()
        baseRevision.current = body.revision ?? baseRevision.current
        pendingSaveId.current = null
        try {
          await draftStore.delete(noteId)
        } catch {
          /* ignore */
        }
        dispatch({
          type: 'SAVE_SUCCESS',
          revision: baseRevision.current,
          savedAt: body.savedAt ? new Date(body.savedAt) : new Date(),
        })
        try {
          broadcast.current?.postMessage({ type: 'saved', noteId, revision: baseRevision.current })
        } catch {
          /* ignore */
        }
      } catch (e) {
        dispatch({
          type: 'SAVE_FAILURE',
          error: { code: 'NET', message: e?.message ?? 'network' },
          networkError: true,
        })
      }
    },
    [noteId, sendChunked],
  )

  const scheduleFlush = useCallback(
    (trigger) => {
      if (stateRef.current.status === 'conflict') return
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => flush(trigger), DEBOUNCE_MS)
      if (!safetyTimer.current) {
        safetyTimer.current = setTimeout(() => flush('safety-flush'), SAFETY_FLUSH_MS)
      }
    },
    [flush],
  )

  const onEditorChange = useCallback(
    (title, content) => {
      latest.current = { title, content }
      dispatch({ type: 'EDITOR_CHANGE', bytesContent: bytesOf(content) })
      if (!pendingSaveId.current) pendingSaveId.current = newSaveId()
      try {
        draftStore.put(noteId, {
          title,
          content,
          baseRevision: baseRevision.current,
          dirtyAt: Date.now(),
          saveId: pendingSaveId.current,
        })
      } catch {
        /* ignore */
      }
      scheduleFlush('debounce')
    },
    [noteId, scheduleFlush],
  )

  const saveNow = useCallback((reason = 'manual') => flush(reason), [flush])

  const resolveConflict = useCallback(
    async (choice) => {
      const conflict = stateRef.current.pendingConflict
      if (!conflict) return
      if (choice === 'take-server') {
        latest.current = { title: conflict.current.title, content: conflict.current.content }
        baseRevision.current = conflict.current.revision
        pendingSaveId.current = null
        try {
          await draftStore.delete(noteId)
        } catch {
          /* ignore */
        }
        dispatch({
          type: 'RESET_TO_SAVED',
          revision: conflict.current.revision,
          savedAt: new Date(),
        })
      } else if (choice === 'keep-mine') {
        baseRevision.current = conflict.current.revision
        pendingSaveId.current = newSaveId()
        dispatch({ type: 'CONFLICT_RESOLVED' })
        flush('manual')
      } else if (typeof choice === 'string' && choice.startsWith('merged:')) {
        const merged = choice.slice('merged:'.length)
        latest.current = { ...latest.current, content: merged }
        baseRevision.current = conflict.current.revision
        pendingSaveId.current = newSaveId()
        dispatch({ type: 'CONFLICT_RESOLVED' })
        flush('manual')
      }
    },
    [noteId, flush],
  )

  const discardDraft = useCallback(async () => {
    try {
      await draftStore.delete(noteId)
    } catch {
      /* ignore */
    }
    pendingSaveId.current = null
    dispatch({ type: 'RESET_TO_SAVED', revision: baseRevision.current, savedAt: new Date() })
  }, [noteId])

  // Call after an external restore: updates baseRevision so the next save
  // doesn't trigger a false 409 conflict.
  const resetRevision = useCallback(
    (newRevision) => {
      baseRevision.current = Number(newRevision ?? 0)
      pendingSaveId.current = null
      try {
        draftStore.delete(noteId)
      } catch {
        /* ignore */
      }
      dispatch({ type: 'RESET_TO_SAVED', revision: baseRevision.current, savedAt: new Date() })
    },
    [noteId],
  )

  useEffect(() => {
    if (!noteId) return undefined
    let cancelled = false
    mountedRef.current = false
    Promise.all([
      fetch(`${API}/api/notes/${noteId}`, { credentials: 'include', headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      draftStore.get(noteId).catch(() => null),
    ]).then(([server, draft]) => {
      if (cancelled) return
      const srv = server?.note ??
        server ?? { title: '', content: '', revision: 0, updatedAt: Date.now() }
      latest.current = { title: srv.title ?? '', content: srv.content ?? '' }
      baseRevision.current = Number(srv.revision ?? 0)
      mountedRef.current = true // server revision is now known; saves are safe

      // If the user typed before mount completed, a debounce flush was blocked.
      // Re-schedule it now that baseRevision is set correctly.
      if (pendingSaveId.current && !draft) {
        scheduleFlush('debounce')
      }

      if (draft) {
        if (Number(draft.baseRevision ?? 0) < baseRevision.current) {
          dispatch({
            type: 'CONFLICT_DETECTED',
            current: srv,
            yours: { title: draft.title, content: draft.content },
          })
          latest.current = { title: draft.title, content: draft.content }
          return
        }
        latest.current = { title: draft.title, content: draft.content }
        pendingSaveId.current = draft.saveId ?? newSaveId()
        dispatch({ type: 'EDITOR_CHANGE', bytesContent: bytesOf(draft.content) })
        scheduleFlush('debounce')
      } else {
        dispatch({
          type: 'RESET_TO_SAVED',
          revision: baseRevision.current,
          savedAt: srv.updatedAt ? new Date(srv.updatedAt) : new Date(),
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [noteId, scheduleFlush])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined
    broadcast.current = new BroadcastChannel('studyhub-notes')
    const onMessage = (ev) => {
      if (ev.data?.type === 'saved' && String(ev.data.noteId) === String(noteId)) {
        if (Number(ev.data.revision) > baseRevision.current) {
          baseRevision.current = Number(ev.data.revision)
          dispatch({ type: 'SERVER_REVISION_ADVANCED', revision: baseRevision.current })
        }
      }
    }
    broadcast.current.addEventListener('message', onMessage)
    return () => {
      broadcast.current?.removeEventListener('message', onMessage)
      broadcast.current?.close()
      broadcast.current = null
    }
  }, [noteId])

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!pendingSaveId.current) return
      const payload = JSON.stringify({
        title: latest.current.title,
        content: latest.current.content,
        baseRevision: baseRevision.current,
        saveId: pendingSaveId.current,
        contentHash: null,
        trigger: 'beforeunload',
      })
      try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' })
          navigator.sendBeacon(`${API}/api/notes/${noteId}`, blob)
        }
      } catch {
        /* ignore */
      }
    }
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
        flush('visibility')
    }
    const onOnline = () => {
      if (pendingSaveId.current) flush('debounce')
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [noteId, flush])

  return useMemo(
    () => ({
      state,
      onEditorChange,
      saveNow,
      resolveConflict,
      discardDraft,
      resetRevision,
      currentValues: latest,
    }),
    [state, onEditorChange, saveNow, resolveConflict, discardDraft, resetRevision],
  )
}
