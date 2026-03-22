/* ═══════════════════════════════════════════════════════════════════════════
 * useNotesData.js — Custom hook for notes data fetching, state, and actions
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

export function useNotesData() {
  /* ── State ───────────────────────────────────────────────────────────── */
  const [notes, setNotes] = useState([])
  const [activeNote, setActiveNote] = useState(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editorPrivate, setEditorPrivate] = useState(true)
  const [editorCourseId, setEditorCourseId] = useState('')
  const [courses, setCourses] = useState([])
  const [filterTab, setFilterTab] = useState('all')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const saveTimer = useRef()

  /* ── Data loading (with abort cleanup to prevent state updates after unmount) */
  useEffect(() => {
    let active = true

    fetch(`${API}/api/notes`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : (Array.isArray(data?.notes) ? data.notes : [])
          setNotes(list)
          setLoadingNotes(false)
        }
      })
      .catch(() => { if (active) setLoadingNotes(false) })

    fetch(`${API}/api/courses/schools`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        if (active) setCourses((data || []).flatMap((school) => (school.courses || []).map((course) => ({ ...course, schoolName: school.name }))))
      })
      .catch(() => {})

    return () => { active = false }
  }, [])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  /* ── Note selection ──────────────────────────────────────────────────── */
  function selectNote(note) {
    setActiveNote(note)
    setEditorTitle(note.title)
    setEditorContent(note.content || '')
    setEditorPrivate(note.private !== false)
    setEditorCourseId(note.courseId ? String(note.courseId) : '')
    setConfirmDelete(false)
  }

  /* ── Auto-save with 1.5s debounce ────────────────────────────────────── */
  const autoSave = useCallback((noteId, title, content, isPrivate, courseId) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!noteId) return
      setSaving(true)
      try {
        const response = await fetch(`${API}/api/notes/${noteId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ title, content, private: isPrivate, courseId: courseId || null }),
        })
        if (response.ok) {
          const updated = await response.json()
          setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)))
          setActiveNote(updated)
        }
      } finally {
        setSaving(false)
      }
    }, 1500)
  }, [])

  /* ── Field change handlers (trigger auto-save) ───────────────────────── */
  function handleTitleChange(value) {
    setEditorTitle(value)
    if (activeNote) autoSave(activeNote.id, value, editorContent, editorPrivate, editorCourseId)
  }
  function handleContentChange(value) {
    setEditorContent(value)
    if (activeNote) autoSave(activeNote.id, editorTitle, value, editorPrivate, editorCourseId)
  }
  function handlePrivateChange(value) {
    setEditorPrivate(value)
    if (activeNote) autoSave(activeNote.id, editorTitle, editorContent, value, editorCourseId)
  }
  function handleCourseChange(value) {
    setEditorCourseId(value)
    if (activeNote) autoSave(activeNote.id, editorTitle, editorContent, editorPrivate, value)
  }

  /* ── Create / Delete ─────────────────────────────────────────────────── */
  async function createNote() {
    setCreating(true)
    try {
      const response = await fetch(`${API}/api/notes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: 'Untitled Note', content: '' }),
      })
      if (!response.ok) return
      const note = await response.json()
      setNotes((prev) => [note, ...prev])
      selectNote(note)
    } finally {
      setCreating(false)
    }
  }

  async function deleteNote() {
    if (!activeNote) return
    const response = await fetch(`${API}/api/notes/${activeNote.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (response.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== activeNote.id))
      setActiveNote(null)
      setConfirmDelete(false)
      showToast('Note deleted', 'success')
    } else {
      showToast('Could not delete note', 'error')
    }
  }

  /* ── Filtered notes list ─────────────────────────────────────────────── */
  const visibleNotes = notes.filter((note) => {
    if (filterTab === 'private') return note.private !== false
    if (filterTab === 'shared') return note.private === false
    return true
  })

  return {
    // State
    notes,
    activeNote,
    setActiveNote,
    editorTitle,
    editorContent,
    editorPrivate,
    editorCourseId,
    courses,
    filterTab,
    setFilterTab,
    saving,
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
    handleCourseChange,
    createNote,
    deleteNote,
  }
}
