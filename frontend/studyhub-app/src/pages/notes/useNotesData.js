/* ═══════════════════════════════════════════════════════════════════════════
 * useNotesData.js — Custom hook for notes data fetching, state, and actions
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'
import { useLivePolling } from '../../lib/useLivePolling'

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

function stripHtml(html) {
  return typeof html === 'string' ? html.replace(/<[^>]+>/g, ' ') : ''
}

export function useNotesData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterTab = NOTE_FILTER_TABS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'all'
  const searchQuery = searchParams.get('q') || ''
  const selectedTag = (searchParams.get('tag') || '').trim().toLowerCase()
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
        if (active)
          setCourses(
            (data || []).flatMap((school) =>
              (school.courses || []).map((course) => ({ ...course, schoolName: school.name })),
            ),
          )
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
  function handlePrivateChange(value) {
    setEditorPrivate(value)
    // When going private, downloads are auto-reset by backend — reflect locally
    if (value) setEditorAllowDownloads(false)
  }
  function handleAllowDownloadsChange(value) {
    setEditorAllowDownloads(value)
  }
  function handleCourseChange(value) {
    setEditorCourseId(value)
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
