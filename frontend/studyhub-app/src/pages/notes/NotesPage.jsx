/* ═══════════════════════════════════════════════════════════════════════════
 * NotesPage.jsx — Personal markdown notes with split-panel editor
 *
 * Layout (responsive):
 *   Desktop/Tablet: notes list (300px) | editor (flex) — side by side
 *   Phone: notes list OR editor — one at a time, back button to return
 *
 * Features: auto-save with 1.5s debounce, private/shared toggle, course
 * tagging, markdown editor with live preview.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import { API } from '../../config'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { MiniPreview, PageShell } from '../shared/pageScaffold'
import { PAGE_FONT, authHeaders, timeAgo } from '../shared/pageUtils'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { NOTES_STEPS } from '../../lib/tutorialSteps'

export default function NotesPage() {
  const { status: authStatus, error: authError } = useProtectedPage()
  const layout = useResponsiveAppLayout()

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

  /* Tutorial popup */
  const tutorial = useTutorial('notes', NOTES_STEPS)

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
    }
  }

  /* ── Filtered notes list ─────────────────────────────────────────────── */
  const visibleNotes = notes.filter((note) => {
    if (filterTab === 'private') return note.private !== false
    if (filterTab === 'shared') return note.private === false
    return true
  })

  /* On phone, show list OR editor. On desktop/tablet, show both. */
  const showListPanel = !layout.isPhone || !activeNote
  const showEditorPanel = !layout.isPhone || Boolean(activeNote)

  /* ── Loading gate ────────────────────────────────────────────────────── */
  if (authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: PAGE_FONT }}>
        Loading…
      </div>
    )
  }

  /* ── Notes list panel ────────────────────────────────────────────────── */
  const notesList = (
    <div>
      {/* Header with filter tabs and new note button */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>My Notes</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Markdown notes per course. Private by default.</p>
          <div data-tutorial="notes-filters" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[
              ['all', 'All Notes'],
              ['private', 'Private'],
              ['shared', 'Shared'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setFilterTab(id); setActiveNote(null) }}
                style={{
                  padding: '4px 12px',
                  borderRadius: 99,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: PAGE_FONT,
                  background: filterTab === id ? '#0f172a' : '#fff',
                  color: filterTab === id ? '#fff' : '#64748b',
                  boxShadow: filterTab === id ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          data-tutorial="notes-create"
          onClick={createNote}
          disabled={creating}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: '#3b82f6', border: 'none',
            borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff',
            cursor: 'pointer', fontFamily: PAGE_FONT,
          }}
        >
          {creating ? 'Creating…' : '+ New Note'}
        </button>
      </div>

      {/* Notes list */}
      {loadingNotes ? (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Loading…</div>
      ) : visibleNotes.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px dashed #cbd5e1', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
            {filterTab === 'private' ? 'No private notes' : filterTab === 'shared' ? 'No shared notes' : 'No notes yet'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
            {filterTab === 'private'
              ? 'Create a note and keep the Private checkbox checked.'
              : filterTab === 'shared'
                ? 'Uncheck "Private" on a note to share it.'
                : 'Create your first note to get started.'}
          </div>
          <button
            onClick={createNote}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT }}
          >
            Create a Note
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => selectNote(note)}
              style={{
                background: activeNote?.id === note.id ? '#eff6ff' : '#fff',
                borderRadius: 12,
                border: activeNote?.id === note.id ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'box-shadow .15s, border-color .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{note.title}</div>
                <span
                  style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 99,
                    background: note.private !== false ? '#f1f5f9' : '#dcfce7',
                    color: note.private !== false ? '#64748b' : '#16a34a',
                    marginLeft: 8, whiteSpace: 'nowrap',
                  }}
                >
                  {note.private !== false ? 'Private' : 'Shared'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 10 }}>
                {note.course ? <span>{note.course.code}</span> : null}
                <span>{timeAgo(note.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  /* ── Editor panel ────────────────────────────────────────────────────── */
  const editorPanel = activeNote ? (
    <div>
      {/* Back button (phone only) */}
      {layout.isPhone && (
        <button
          onClick={() => setActiveNote(null)}
          style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT, marginBottom: 10, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          ← All Notes
        </button>
      )}

      {/* Title bar with metadata controls */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={editorTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title…"
          style={{ flex: '1 1 200px', border: 'none', outline: 'none', fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: PAGE_FONT, minWidth: 120 }}
        />
        <select
          value={editorCourseId}
          onChange={(e) => handleCourseChange(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontFamily: PAGE_FONT, color: '#64748b', outline: 'none' }}
        >
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={String(c.id)}>{c.code}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={editorPrivate} onChange={(e) => handlePrivateChange(e.target.checked)} />
          Private
        </label>
        {saving
          ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Saving…</span>
          : <span style={{ fontSize: 11, color: '#10b981' }}>✓ Saved</span>
        }
      </div>

      {/* Markdown editor with live preview */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ padding: '8px 14px', borderRight: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: '#3b82f6' }}>
            Markdown
          </div>
          <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
            Preview
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 400 }}>
          <div style={{ borderRight: '1px solid #1e293b', background: '#0f172a' }}>
            <textarea
              value={editorContent}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%', height: '100%', minHeight: 400,
                background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', padding: '14px 16px',
                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                fontSize: 12, lineHeight: 1.9, color: '#e2e8f0', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ padding: '14px 18px', overflowY: 'auto', maxHeight: 500 }}>
            <MiniPreview md={editorContent} />
          </div>
        </div>
      </div>

      {/* Delete controls */}
      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#dc2626' }}>Delete this note permanently?</span>
          <button onClick={deleteNote} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>Yes, delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>
          Delete Note
        </button>
      )}
    </div>
  ) : (
    /* Empty state when no note selected (desktop only) */
    !layout.isPhone && (
      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px dashed #cbd5e1', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }}>📝</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
          Select a note to edit
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Choose a note from the list or create a new one.
        </div>
      </div>
    )
  )

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'My Notes', to: '/notes' }]} hideTabs />} sidebar={<AppSidebar />}>
      {authError ? (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          {authError}
        </div>
      ) : null}

      {/* Split panel: list (300px) | editor (flex) on desktop/tablet
       * Single panel on phone: either list or editor */}
      <div className="notes-split-panel">
        {showListPanel && <div>{notesList}</div>}
        {showEditorPanel && <div>{editorPanel}</div>}
      </div>

      {/* Tutorial popup */}
      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen && (
        <button type="button" onClick={tutorial.restart} title="Show tutorial" style={{ position: 'fixed', bottom: 24, right: 24, width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', zIndex: 50, display: 'grid', placeItems: 'center' }}>?</button>
      )}
    </PageShell>
  )
}
