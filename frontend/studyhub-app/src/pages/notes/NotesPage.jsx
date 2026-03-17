// NotesPage owns personal note CRUD so note editing stays isolated from the larger feed and sheet routes.
import { useCallback, useEffect, useRef, useState } from 'react'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import { API } from '../../config'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { MiniPreview, PageShell, PAGE_FONT, authHeaders, timeAgo } from '../shared/pageScaffold'

export default function NotesPage() {
  const { status: authStatus, error: authError } = useProtectedPage()
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

  useEffect(() => {
    fetch(`${API}/api/notes`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        setNotes(Array.isArray(data) ? data : [])
        setLoadingNotes(false)
      })
      .catch(() => setLoadingNotes(false))

    fetch(`${API}/api/courses/schools`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => setCourses((data || []).flatMap((school) => (school.courses || []).map((course) => ({ ...course, schoolName: school.name })))))
      .catch(() => {})
  }, [])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  function selectNote(note) {
    setActiveNote(note)
    setEditorTitle(note.title)
    setEditorContent(note.content || '')
    setEditorPrivate(note.private !== false)
    setEditorCourseId(note.courseId ? String(note.courseId) : '')
    setConfirmDelete(false)
  }

  // Debounce note persistence so the editor stays responsive while users type continuously.
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
          setNotes((previousNotes) => previousNotes.map((note) => (note.id === noteId ? updated : note)))
          setActiveNote(updated)
        }
      } finally {
        setSaving(false)
      }
    }, 1500)
  }, [])

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
      setNotes((previousNotes) => [note, ...previousNotes])
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
      setNotes((previousNotes) => previousNotes.filter((note) => note.id !== activeNote.id))
      setActiveNote(null)
      setConfirmDelete(false)
    }
  }

  const visibleNotes = notes.filter((note) => {
    if (filterTab === 'private') return note.private !== false
    if (filterTab === 'shared') return note.private === false
    return true
  })

  if (authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: PAGE_FONT }}>
        Loading…
      </div>
    )
  }

  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'My Notes', to: '/notes' }]} hideTabs />} sidebar={<AppSidebar />}>
      {authError ? (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          {authError}
        </div>
      ) : null}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>My Notes</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Markdown notes per course. Private by default.</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[
              ['all', 'All Notes'],
              ['private', 'Private'],
              ['shared', 'Shared'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setFilterTab(id)
                  setActiveNote(null)
                }}
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
                <i className={`fas ${id === 'all' ? 'fa-layer-group' : id === 'private' ? 'fa-lock' : 'fa-share-nodes'}`} style={{ marginRight: 5, fontSize: 10 }} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={createNote}
          disabled={creating}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            background: '#3b82f6',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: PAGE_FONT,
          }}
        >
          <i className="fas fa-plus" style={{ fontSize: 13 }} />
          {creating ? 'Creating…' : 'New Note'}
        </button>
      </div>

      {loadingNotes ? (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Loading…</div>
      ) : visibleNotes.length === 0 && !activeNote ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px dashed #cbd5e1', padding: '48px 24px', textAlign: 'center' }}>
          <i className="fas fa-book-open" style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 12, display: 'block' }} />
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
        <>
          {!activeNote ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {visibleNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => selectNote(note)}
                  style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', cursor: 'pointer', transition: 'box-shadow .15s' }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{note.title}</div>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: note.private !== false ? '#f1f5f9' : '#dcfce7',
                        color: note.private !== false ? '#64748b' : '#16a34a',
                        marginLeft: 8,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.private !== false ? 'Private' : 'Shared'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 10 }}>
                    {note.course ? <span><i className="fas fa-book" style={{ marginRight: 4 }} />{note.course.code}</span> : null}
                    <span>{timeAgo(note.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeNote ? (
            <div>
              <button
                onClick={() => setActiveNote(null)}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT, marginBottom: 10, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <i className="fas fa-arrow-left" /> All Notes
              </button>

              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={editorTitle}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  placeholder="Note title…"
                  style={{ flex: '1 1 200px', border: 'none', outline: 'none', fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: PAGE_FONT, minWidth: 120 }}
                />
                <select
                  value={editorCourseId}
                  onChange={(event) => handleCourseChange(event.target.value)}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontFamily: PAGE_FONT, color: '#64748b', outline: 'none' }}
                >
                  <option value="">No course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={String(course.id)}>
                      {course.code}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editorPrivate} onChange={(event) => handlePrivateChange(event.target.checked)} />
                  Private
                </label>
                {saving ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Saving…</span> : <span style={{ fontSize: 11, color: '#10b981' }}><i className="fas fa-check" style={{ marginRight: 3 }} />Saved</span>}
              </div>

              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ padding: '8px 14px', borderRight: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: '#3b82f6' }}>
                    <i className="fas fa-pen" style={{ marginRight: 6 }} />
                    Markdown
                  </div>
                  <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                    <i className="fas fa-eye" style={{ marginRight: 6 }} />
                    Preview
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 360 }}>
                  <div style={{ borderRight: '1px solid #1e293b', background: '#0f172a' }}>
                    <textarea
                      value={editorContent}
                      onChange={(event) => handleContentChange(event.target.value)}
                      spellCheck={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        minHeight: 360,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        resize: 'none',
                        padding: '14px 16px',
                        fontFamily: "'JetBrains Mono','Fira Code',monospace",
                        fontSize: 12,
                        lineHeight: 1.9,
                        color: '#e2e8f0',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ padding: '14px 18px', overflowY: 'auto', maxHeight: 500 }}>
                    <MiniPreview md={editorContent} />
                  </div>
                </div>
              </div>

              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#dc2626' }}>Delete this note permanently?</span>
                  <button onClick={deleteNote} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>
                  <i className="fas fa-trash" style={{ marginRight: 6 }} />
                  Delete Note
                </button>
              )}
            </div>
          ) : null}
        </>
      )}
    </PageShell>
  )
}
