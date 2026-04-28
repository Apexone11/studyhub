/* ═══════════════════════════════════════════════════════════════════════════
 * useNotesData.js — Custom hook for notes data fetching, state, and actions
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'
import { useLivePolling } from '../../lib/useLivePolling'
import { useSession } from '../../lib/session-context'
import { stripHtmlForPreview } from './noteHtml.js'
import { enrolledSchoolIdsFromUser, flattenSchoolsToCourses } from '../../lib/courses.js'

const NOTE_FILTER_TABS = new Set(['all', 'private', 'shared', 'starred'])

function parseNoteTags(tagsValue) {
  if (Array.isArray(tagsValue)) {
    return tagsValue.filter((tag) => typeof tag === 'string' && tag.trim())
  }

  if (typeof tagsValue !== 'string' || !tagsValue.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(tagsValue)
    return Array.isArray(parsed)
      ? parsed.filter((tag) => typeof tag === 'string' && tag.trim())
      : []
  } catch {
    return []
  }
}

function normalizeNote(note) {
  if (!note || typeof note !== 'object') {
    return note
  }

  return {
    ...note,
    tags: parseNoteTags(note.tags),
    _starred: Boolean(note._starred ?? note.starred ?? false),
  }
}

// Search needs the same plain-text projection the sidebar preview uses
// so a search for "hello" matches a note with `<p>hello</p>` AND a note
// containing `&amp;` rendered as `&`. Previously this was a naive
// `replace(/<[^>]+>/g, ' ')` that left HTML entities raw and produced
// search misses on entity-encoded characters.
function stripHtml(html) {
  return stripHtmlForPreview(html)
}

export function useNotesData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterTab = NOTE_FILTER_TABS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'all'
  const searchQuery = searchParams.get('q') || ''
  const selectedTag = (searchParams.get('tag') || '').trim().toLowerCase()
  const { user } = useSession()
  const enrolledSchoolIds = useMemo(() => enrolledSchoolIdsFromUser(user), [user])
  /* ── State ───────────────────────────────────────────────────────────── */
  const [notes, setNotes] = useState([])
  const [activeNote, setActiveNote] = useState(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editorPrivate, setEditorPrivate] = useState(true)
  const [editorCourseId, setEditorCourseId] = useState('')
  const [editorAllowDownloads, setEditorAllowDownloads] = useState(false)
  const [courses, setCourses] = useState([])
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  // Tracks the currently selected note id so async metadata PATCH responses
  // can detect when the user navigated to a different note before the
  // request settled. Without this, a late response would leak its
  // success-side editor-state mutations or a failed-revert into the new
  // note's editor and corrupt the UI.
  const activeNoteIdRef = useRef(null)
  useEffect(() => {
    activeNoteIdRef.current = activeNote?.id ?? null
  }, [activeNote?.id])

  const updateSearchParam = useCallback(
    (key, value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setFilterTab = useCallback(
    (value) => {
      updateSearchParam('tab', NOTE_FILTER_TABS.has(value) ? value : 'all')
    },
    [updateSearchParam],
  )

  const setSearchQuery = useCallback(
    (value) => {
      updateSearchParam('q', value)
    },
    [updateSearchParam],
  )

  const setSelectedTag = useCallback(
    (value) => {
      updateSearchParam('tag', value ? value.toLowerCase() : '')
    },
    [updateSearchParam],
  )

  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        next.delete('tag')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  /* ── Data loading (with abort cleanup to prevent state updates after unmount) */
  // `hasLoadedNotesOnceRef` lets us silence the toast on polling failures —
  // a transient network blip during a 60-s background refresh shouldn't
  // look like the initial load failed.
  const hasLoadedNotesOnceRef = useRef(false)

  const loadNotes = useCallback(async ({ signal } = {}) => {
    try {
      const response = await fetch(`${API}/api/notes`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const list = Array.isArray(data) ? data : Array.isArray(data?.notes) ? data.notes : []
      const normalized = list.map(normalizeNote)
      setNotes(normalized)
      setLoadingNotes(false)
      hasLoadedNotesOnceRef.current = true
    } catch (err) {
      if (err?.name === 'AbortError') return
      // Only show the toast on the very first attempt. Polling failures
      // stay silent so a momentary network drop doesn't spam the user.
      if (!hasLoadedNotesOnceRef.current) {
        showToast('Failed to load notes', 'error')
      }
      setLoadingNotes(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    loadNotes()

    // The rest of this effect fetches the course-school list; that one
    // doesn't need polling (course enrollments change rarely).
    // cache: 'no-cache' bypasses any stale 5xx the browser disk cache may
    // be holding from before recent backend CORS / Cache-Control fixes
    // shipped — without this, a poisoned cached response keeps firing
    // the "Failed to load courses" toast on every page load.
    fetch(`${API}/api/courses/schools`, {
      headers: authHeaders(),
      credentials: 'include',
      cache: 'no-cache',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('schools fetch failed')
        // Defensive parse: a cached empty body, CORS-blocked opaque
        // response, or transient truncation makes .json() throw
        // "Unexpected end of JSON input" which we'd silently treat as
        // a load failure. Read text first, parse second, treat empty
        // as failure.
        const text = await response.text()
        if (!text) throw new Error('schools fetch returned empty body')
        return JSON.parse(text)
      })
      .then((data) => {
        if (active) setCourses(flattenSchoolsToCourses(data))
      })
      .catch(() => {
        if (active) {
          showToast('Failed to load courses', 'error')
        }
      })

    return () => {
      active = false
    }
  }, [loadNotes])

  // Background refresh: the notes list is shared data (shared notes from
  // classmates, or saves from other devices), so a light 60-s poll keeps
  // it in sync without any manual refresh. `useLivePolling` already
  // pauses when the tab is hidden and re-runs immediately on focus /
  // online / visibility change, so this is cheap.
  useLivePolling(loadNotes, {
    intervalMs: 60 * 1000,
    immediate: false, // the initial load above already ran
  })

  /* ── Auto-select note from ?select=:id URL param (for "Open in Editor" flow) */
  useEffect(() => {
    const selectId = searchParams.get('select')
    if (!selectId || loadingNotes || notes.length === 0) return
    const target = notes.find((n) => String(n.id) === selectId)
    if (target) {
      selectNote(target)
      // Clean up the URL param after selecting
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('select')
          return next
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingNotes, notes, setSearchParams])

  /* ── Note selection ──────────────────────────────────────────────────── */
  function selectNote(note) {
    setActiveNote(note)
    setEditorTitle(note.title)
    setEditorContent(note.content || '')
    setEditorPrivate(note.private !== false)
    setEditorAllowDownloads(note.allowDownloads || false)
    setEditorCourseId(note.courseId ? String(note.courseId) : '')
    setConfirmDelete(false)
  }

  /* ── Field change handlers (persistence owned by useNotePersistence) ── */
  function handleTitleChange(value) {
    setEditorTitle(value)
  }
  function handleContentChange(value) {
    setEditorContent(value)
  }

  /**
   * Persist a metadata change (private / allowDownloads / courseId) for the
   * active note via PATCH /api/notes/:id/metadata. Updates the local React
   * state optimistically, also patches the sidebar list row so the new
   * value is visible immediately, and reverts on failure with a toast.
   *
   * Why: the hardened content-save path only persists `title`/`content`,
   * so these three controls were updating client state but never reaching
   * the backend. After a reload the selectors snapped back to whatever
   * was persisted, which made them feel broken.
   */
  async function persistMetadataChange(field, value, optimisticApply, revert) {
    const note = activeNote
    if (!note?.id) return
    const targetNoteId = note.id
    // Snapshot the prior list-row value BEFORE the optimistic patch lands.
    // The earlier version of this code tried to derive the prior value
    // from the in-flight `value` (e.g. `!value === false ? !value : !value`,
    // which is just `!value` for any input) and ended up corrupting
    // numeric courseId rows into booleans on save failure. Capturing the
    // snapshot up front is the only safe rollback.
    const previousRowValue = note[field]
    optimisticApply()
    setNotes((prev) => prev.map((n) => (n.id === targetNoteId ? { ...n, [field]: value } : n)))
    setActiveNote((prev) => (prev?.id === targetNoteId ? { ...prev, [field]: value } : prev))
    let serverErrorMessage = ''
    try {
      const response = await fetch(`${API}/api/notes/${targetNoteId}/metadata`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value }),
      })
      if (!response.ok) {
        // Capture the server's error message so the toast can surface it.
        // Generic "Failed to update note settings" hid CSRF / 403 / 404 /
        // enrollment-check errors during the prod incident — surface it.
        const errBody = await response.json().catch(() => ({}))
        serverErrorMessage =
          (typeof errBody?.error === 'string' && errBody.error.trim()) || `HTTP ${response.status}`
        throw new Error(serverErrorMessage)
      }
      const data = await response.json().catch(() => ({}))
      // Trust the server's normalized row (e.g. it auto-cleared
      // allowDownloads when private went true).
      const serverNote = data?.note
      if (serverNote) {
        const normalized = normalizeNote(serverNote)
        setNotes((prev) => prev.map((n) => (n.id === normalized.id ? { ...n, ...normalized } : n)))
        // Only sync activeNote + editor-state when the user is still on
        // the same note. Otherwise a late response would overwrite the
        // newly-selected note's editor fields.
        const stillActive = activeNoteIdRef.current === targetNoteId
        if (stillActive) {
          setActiveNote((prev) => (prev?.id === normalized.id ? { ...prev, ...normalized } : prev))
          if (Object.prototype.hasOwnProperty.call(normalized, 'allowDownloads')) {
            setEditorAllowDownloads(Boolean(normalized.allowDownloads))
          }
        }
      }
    } catch {
      // List-row rollback is always safe (keyed by id, doesn't touch the
      // editor). But the editor-level revert() (and activeNote patch)
      // must only run if the user is still on the original note.
      setNotes((prev) =>
        prev.map((n) => (n.id === targetNoteId ? { ...n, [field]: previousRowValue } : n)),
      )
      const stillActive = activeNoteIdRef.current === targetNoteId
      if (stillActive) {
        revert()
        setActiveNote((prev) =>
          prev?.id === targetNoteId ? { ...prev, [field]: previousRowValue } : prev,
        )
      }
      showToast(
        serverErrorMessage
          ? `Failed to update note settings: ${serverErrorMessage}`
          : 'Failed to update note settings',
        'error',
      )
    }
  }

  function handlePrivateChange(value) {
    const previous = editorPrivate
    const previousDownloads = editorAllowDownloads
    persistMetadataChange(
      'private',
      value,
      () => {
        setEditorPrivate(value)
        // Mirror the backend behavior locally so the Downloads checkbox
        // doesn't blink — going private clears downloads.
        if (value) setEditorAllowDownloads(false)
      },
      () => {
        setEditorPrivate(previous)
        setEditorAllowDownloads(previousDownloads)
      },
    )
  }
  function handleAllowDownloadsChange(value) {
    const previous = editorAllowDownloads
    persistMetadataChange(
      'allowDownloads',
      value,
      () => setEditorAllowDownloads(value),
      () => setEditorAllowDownloads(previous),
    )
  }
  function handleCourseChange(value) {
    const previous = editorCourseId
    // The dropdown emits string values ("" for "No course"). Convert to
    // null/number for the backend so the metadata controller's parseInt
    // succeeds and the courseId column is set correctly.
    const courseIdForServer = value === '' || value == null ? null : Number.parseInt(value, 10)
    persistMetadataChange(
      'courseId',
      courseIdForServer,
      () => setEditorCourseId(value),
      () => setEditorCourseId(previous),
    )
  }

  /* ── Create / Delete ─────────────────────────────────────────────────── */
  async function createNote() {
    setCreating(true)
    try {
      const response = await fetch(`${API}/api/notes`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ title: 'Untitled Note', content: '' }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        showToast(errData.error || 'Failed to create note', 'error')
        return
      }
      const note = normalizeNote(await response.json())
      setNotes((prev) => [note, ...prev])
      selectNote(note)
    } finally {
      setCreating(false)
    }
  }

  async function deleteNote() {
    if (!activeNote) return
    try {
      const response = await fetch(`${API}/api/notes/${activeNote.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (response.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== activeNote.id))
        setActiveNote(null)
        setConfirmDelete(false)
        showToast('Note deleted', 'success')
      } else {
        showToast('Could not delete note', 'error')
      }
    } catch {
      showToast('Failed to delete note', 'error')
    }
  }

  /* ── Star toggle ─────────────────────────────────────────────────────── */
  async function toggleStar(noteId) {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    const isStarred = note._starred
    // Optimistic update
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, _starred: !isStarred } : n)))
    if (activeNote?.id === noteId)
      setActiveNote((prev) => (prev ? { ...prev, _starred: !isStarred } : prev))
    try {
      const res = await fetch(`${API}/api/notes/${noteId}/star`, {
        method: isStarred ? 'DELETE' : 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) {
        // Revert optimistic update on failure
        setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, _starred: isStarred } : n)))
        if (activeNote?.id === noteId)
          setActiveNote((prev) => (prev ? { ...prev, _starred: isStarred } : prev))
        showToast('Failed to update star', 'error')
      }
    } catch {
      // Revert optimistic update on error
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, _starred: isStarred } : n)))
      if (activeNote?.id === noteId)
        setActiveNote((prev) => (prev ? { ...prev, _starred: isStarred } : prev))
      showToast('Failed to update star', 'error')
    }
  }

  /* ── Pin toggle ─────────────────────────────────────────────────────── */
  async function togglePin(noteId) {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    const wasPinned = note.pinned
    // Optimistic update
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, pinned: !wasPinned } : n)))
    if (activeNote?.id === noteId)
      setActiveNote((prev) => (prev ? { ...prev, pinned: !wasPinned } : prev))
    try {
      const res = await fetch(`${API}/api/notes/${noteId}/pin`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ pinned: !wasPinned }),
      })
      if (res.ok) {
        const data = await res.json()
        setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, pinned: data.pinned } : n)))
        if (activeNote?.id === noteId)
          setActiveNote((prev) => (prev ? { ...prev, pinned: data.pinned } : prev))
      } else {
        // Revert optimistic update on failure
        setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, pinned: wasPinned } : n)))
        if (activeNote?.id === noteId)
          setActiveNote((prev) => (prev ? { ...prev, pinned: wasPinned } : prev))
        showToast('Failed to update pin', 'error')
      }
    } catch {
      // Revert optimistic update on error
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, pinned: wasPinned } : n)))
      if (activeNote?.id === noteId)
        setActiveNote((prev) => (prev ? { ...prev, pinned: wasPinned } : prev))
      showToast('Failed to update pin', 'error')
    }
  }

  /* ── Restore version ────────────────────────────────────────────────── */
  function handleRestore(restoredNote) {
    const normalized = normalizeNote(restoredNote)
    setNotes((prev) =>
      prev.map((note) =>
        note.id === normalized.id ? { ...normalized, _starred: note._starred } : note,
      ),
    )
    selectNote({
      ...normalized,
      _starred: activeNote?.id === normalized.id ? activeNote._starred : normalized._starred,
    })
    showToast('Version restored', 'success')
  }

  const handleTagsChange = useCallback((noteId, nextTags) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === noteId ? { ...note, tags: nextTags } : note)),
    )
    setActiveNote((prev) => (prev?.id === noteId ? { ...prev, tags: nextTags } : prev))
  }, [])

  // Used by NoteEditor to push a local optimistic update into the
  // sidebar list after each successful autosave. Without this, the
  // sidebar's title and preview stay stale until the next 60s poll —
  // making autosave feel broken even though the persistence layer is
  // working. Pinned/starred booleans are preserved from the prior
  // local row so they aren't clobbered by a partial patch.
  const patchNoteLocally = useCallback((noteId, partial) => {
    if (!noteId || !partial || typeof partial !== 'object') return
    setNotes((prev) => prev.map((note) => (note.id === noteId ? { ...note, ...partial } : note)))
    setActiveNote((prev) => (prev?.id === noteId ? { ...prev, ...partial } : prev))
  }, [])

  const notesByTab = notes.filter((note) => {
    if (filterTab === 'private') return note.private !== false
    if (filterTab === 'shared') return note.private === false
    if (filterTab === 'starred') return note._starred
    return true
  })

  const availableTags = [...new Set(notesByTab.flatMap((note) => note.tags || []))].sort(
    (left, right) => left.localeCompare(right),
  )

  /* ── Filtered notes list ─────────────────────────────────────────────── */
  const visibleNotes = notesByTab
    .filter((note) => {
      const matchesTag = !selectedTag || note.tags?.includes(selectedTag)
      if (!matchesTag) return false

      if (!searchQuery.trim()) return true

      const haystack = [
        note.title,
        stripHtml(note.content),
        note.course?.code,
        ...(note.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(searchQuery.trim().toLowerCase())
    })
    .sort((a, b) => {
      // Pinned notes always float to top
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return 0 // preserve server order (updatedAt desc) otherwise
    })

  return {
    // State
    notes,
    activeNote,
    setActiveNote,
    editorTitle,
    editorContent,
    editorPrivate,
    editorAllowDownloads,
    editorCourseId,
    courses,
    enrolledSchoolIds,
    filterTab,
    setFilterTab,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    clearFilters,
    availableTags,
    saving: false,
    creating,
    confirmDelete,
    setConfirmDelete,
    loadingNotes,
    visibleNotes,

    // Actions
    selectNote,
    handleTitleChange,
    handleContentChange,
    handlePrivateChange,
    handleAllowDownloadsChange,
    handleCourseChange,
    createNote,
    deleteNote,
    toggleStar,
    togglePin,
    handleRestore,
    handleTagsChange,
    patchNoteLocally,
  }
}
