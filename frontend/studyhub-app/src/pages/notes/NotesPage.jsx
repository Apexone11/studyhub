/* ═══════════════════════════════════════════════════════════════════════════
 * NotesPage.jsx — Personal markdown notes with split-panel editor
 *
 * Redesigned v1.5.1:
 *   - Light-themed editor (no more dark background)
 *   - Markdown formatting toolbar (bold, italic, heading, list, code, link)
 *   - Real markdown-to-HTML preview via marked + DOMPurify
 *   - Word count, improved typography, better visual hierarchy
 *
 * Layout (responsive):
 *   Desktop/Tablet: notes list (300px) | editor (flex) — side by side
 *   Phone: notes list OR editor — one at a time, back button to return
 *
 * Features: auto-save with 1.5s debounce, private/shared toggle, course
 * tagging, markdown toolbar, live preview, word count.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import { API } from '../../config'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT, authHeaders, timeAgo } from '../shared/pageUtils'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { NOTES_STEPS } from '../../lib/tutorialSteps'
import { staggerEntrance } from '../../lib/animations'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonList } from '../../components/Skeleton'

/* ── Configure marked for safe rendering ─────────────────────────────── */
marked.setOptions({
  breaks: true,
  gfm: true,
})

/* ── Markdown toolbar actions ────────────────────────────────────────── */
const TOOLBAR_ACTIONS = [
  { key: 'bold', label: 'B', title: 'Bold', before: '**', after: '**', style: { fontWeight: 800 } },
  { key: 'italic', label: 'I', title: 'Italic', before: '_', after: '_', style: { fontStyle: 'italic' } },
  { key: 'h2', label: 'H', title: 'Heading', before: '## ', after: '', style: { fontWeight: 800, fontSize: 13 } },
  { key: 'ul', label: '•', title: 'Bullet list', before: '- ', after: '', style: { fontSize: 16, lineHeight: '14px' } },
  { key: 'ol', label: '1.', title: 'Numbered list', before: '1. ', after: '', style: { fontSize: 11, fontWeight: 700 } },
  { key: 'code', label: '</>', title: 'Inline code', before: '`', after: '`', style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 700 } },
  { key: 'codeblock', label: '{ }', title: 'Code block', before: '```\n', after: '\n```', style: { fontFamily: 'monospace', fontSize: 10, fontWeight: 700 } },
  { key: 'link', label: '🔗', title: 'Link', before: '[', after: '](url)', style: { fontSize: 12 } },
  { key: 'quote', label: '❝', title: 'Blockquote', before: '> ', after: '', style: { fontSize: 14, lineHeight: '14px' } },
]

function applyToolbarAction(textareaRef, action, content, onChange) {
  const textarea = textareaRef.current
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = content.slice(start, end)
  const lineStart = action.before.endsWith(' ') || action.before.endsWith('\n')

  let newText
  let cursorPos
  if (lineStart && !selected) {
    // Line-start prefix: insert at beginning of current line
    const lineBegin = content.lastIndexOf('\n', start - 1) + 1
    newText = content.slice(0, lineBegin) + action.before + content.slice(lineBegin)
    cursorPos = lineBegin + action.before.length
  } else {
    newText = content.slice(0, start) + action.before + selected + action.after + content.slice(end)
    cursorPos = start + action.before.length + selected.length + action.after.length
  }

  onChange(newText)
  // Restore cursor position after React re-render
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorPos, cursorPos)
  })
}

/* ── Safe markdown renderer ──────────────────────────────────────────── */
function MarkdownPreview({ content }) {
  const html = useMemo(() => {
    if (!content?.trim()) return ''
    const raw = marked.parse(content)
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [content])

  if (!html) {
    return (
      <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
        Start typing to see preview…
      </div>
    )
  }

  return (
    <div
      className="notes-markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/* ── Word count helper ───────────────────────────────────────────────── */
function wordCount(text) {
  if (!text?.trim()) return 0
  return text.trim().split(/\s+/).length
}

export default function NotesPage() {
  usePageTitle('My Notes')
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
  const editorRef = useRef(null)
  const notesListRef = useRef(null)
  const animatedRef = useRef(false)

  /* Tutorial popup */
  const tutorial = useTutorial('notes', NOTES_STEPS)

  /* Animate notes list on first load */
  useEffect(() => {
    if (loadingNotes || animatedRef.current || notes.length === 0) return
    animatedRef.current = true
    if (notesListRef.current) staggerEntrance(notesListRef.current.children, { staggerMs: 50, duration: 400, y: 12 })
  }, [loadingNotes, notes.length])

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
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading, #0f172a)', marginBottom: 4 }}>My Notes</h1>
          <p style={{ fontSize: 13, color: 'var(--sh-muted, #64748b)' }}>Markdown notes per course. Private by default.</p>
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
                  padding: '5px 14px',
                  borderRadius: 99,
                  border: filterTab === id ? '1px solid #3b82f6' : '1px solid var(--sh-border, #e2e8f0)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: PAGE_FONT,
                  background: filterTab === id ? '#3b82f6' : 'var(--sh-surface, #fff)',
                  color: filterTab === id ? '#fff' : 'var(--sh-muted, #64748b)',
                  transition: 'all .15s',
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
            padding: '8px 16px', background: '#3b82f6', border: 'none',
            borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff',
            cursor: 'pointer', fontFamily: PAGE_FONT,
            boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
            transition: 'box-shadow .15s',
          }}
        >
          {creating ? 'Creating…' : '+ New Note'}
        </button>
      </div>

      {/* Notes list */}
      {loadingNotes ? (
        <SkeletonList count={4} />
      ) : visibleNotes.length === 0 ? (
        <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 16, border: '2px dashed var(--sh-border, #cbd5e1)', padding: '52px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 6 }}>
            {filterTab === 'private' ? 'No private notes' : filterTab === 'shared' ? 'No shared notes' : 'No notes yet'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', marginBottom: 18, lineHeight: 1.6 }}>
            {filterTab === 'private'
              ? 'Create a note and keep the Private checkbox checked.'
              : filterTab === 'shared'
                ? 'Uncheck "Private" on a note to share it with classmates.'
                : 'Create your first markdown note to get started.'}
          </div>
          <button
            onClick={createNote}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT, boxShadow: '0 2px 8px rgba(59,130,246,0.25)' }}
          >
            Create a Note
          </button>
        </div>
      ) : (
        <div ref={notesListRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleNotes.map((note) => {
            const isActive = activeNote?.id === note.id
            return (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                style={{
                  background: isActive ? '#eff6ff' : 'var(--sh-surface, #fff)',
                  borderRadius: 12,
                  border: isActive ? '1.5px solid #93c5fd' : '1px solid var(--sh-border, #e2e8f0)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#93c5fd' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = 'var(--sh-border, #e2e8f0)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', lineHeight: 1.3 }}>
                    {note.title || 'Untitled'}
                  </div>
                  <span
                    style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 99, fontWeight: 600,
                      background: note.private !== false ? 'var(--sh-soft, #f1f5f9)' : '#dcfce7',
                      color: note.private !== false ? 'var(--sh-muted, #64748b)' : '#16a34a',
                      marginLeft: 8, whiteSpace: 'nowrap',
                    }}
                  >
                    {note.private !== false ? 'Private' : 'Shared'}
                  </span>
                </div>
                {note.content?.trim() ? (
                  <div style={{ fontSize: 12, color: 'var(--sh-subtext, #94a3b8)', lineHeight: 1.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {note.content.slice(0, 80)}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--sh-subtext, #94a3b8)', display: 'flex', gap: 10 }}>
                  {note.course ? <span style={{ fontWeight: 600, color: '#3b82f6' }}>{note.course.code}</span> : null}
                  <span>{timeAgo(note.updatedAt)}</span>
                </div>
              </div>
            )
          })}
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
          style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 13, cursor: 'pointer', fontFamily: PAGE_FONT, marginBottom: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
        >
          ← All Notes
        </button>
      )}

      {/* Title bar with metadata controls */}
      <div style={{
        background: 'var(--sh-surface, #fff)', borderRadius: 14, border: '1px solid var(--sh-border, #e2e8f0)',
        padding: '14px 18px', marginBottom: 10,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={editorTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title…"
          style={{ flex: '1 1 200px', border: 'none', outline: 'none', fontSize: 18, fontWeight: 800, color: 'var(--sh-heading, #0f172a)', fontFamily: PAGE_FONT, minWidth: 120, background: 'transparent' }}
        />
        <select
          value={editorCourseId}
          onChange={(e) => handleCourseChange(e.target.value)}
          style={{ border: '1px solid var(--sh-border, #e2e8f0)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: PAGE_FONT, color: 'var(--sh-muted, #64748b)', outline: 'none', background: 'var(--sh-surface, #fff)' }}
        >
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={String(c.id)}>{c.code}</option>)}
        </select>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer',
          padding: '4px 10px', borderRadius: 8,
          background: editorPrivate ? 'var(--sh-soft, #f1f5f9)' : '#dcfce7',
          color: editorPrivate ? 'var(--sh-muted, #64748b)' : '#16a34a',
          fontWeight: 600, transition: 'all .15s',
        }}>
          <input type="checkbox" checked={editorPrivate} onChange={(e) => handlePrivateChange(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
          {editorPrivate ? 'Private' : 'Shared'}
        </label>
        <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving
            ? <span style={{ color: '#94a3b8' }}>Saving…</span>
            : <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Saved</span>
          }
        </div>
      </div>

      {/* Markdown editor with live preview — REDESIGNED */}
      <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 14, border: '1px solid var(--sh-border, #e2e8f0)', overflow: 'hidden', marginBottom: 10 }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, padding: '6px 12px',
          borderBottom: '1px solid var(--sh-border, #e2e8f0)',
          background: 'var(--sh-soft, #f8fafc)',
          flexWrap: 'wrap',
        }}>
          {TOOLBAR_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              title={action.title}
              onClick={() => applyToolbarAction(editorRef, action, editorContent, handleContentChange)}
              style={{
                width: 30, height: 30, display: 'grid', placeItems: 'center',
                border: 'none', background: 'transparent', borderRadius: 6,
                cursor: 'pointer', color: 'var(--sh-muted, #475569)',
                transition: 'background .1s, color .1s',
                ...action.style,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sh-muted, #475569)' }}
            >
              {action.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--sh-subtext, #94a3b8)', fontWeight: 500 }}>
            {wordCount(editorContent)} words
          </span>
        </div>

        {/* Editor + Preview split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: 'none' }}>
          {/* Column headers */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--sh-border, #e2e8f0)', borderRight: '1px solid var(--sh-border, #e2e8f0)', fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Write
          </div>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--sh-border, #e2e8f0)', fontSize: 11, fontWeight: 700, color: 'var(--sh-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Preview
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 420 }}>
          {/* Write pane — light background */}
          <div style={{ borderRight: '1px solid var(--sh-border, #e2e8f0)' }}>
            <textarea
              ref={editorRef}
              value={editorContent}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
              placeholder="Write your notes in markdown…&#10;&#10;# Heading&#10;**bold** _italic_ `code`&#10;- bullet list&#10;1. numbered list&#10;> blockquote"
              style={{
                width: '100%', height: '100%', minHeight: 420,
                background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', padding: '16px 18px',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontSize: 13, lineHeight: 1.8,
                color: 'var(--sh-text, #1e293b)',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {/* Preview pane */}
          <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 520 }}>
            <MarkdownPreview content={editorContent} />
          </div>
        </div>
      </div>

      {/* Footer: word count + delete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Delete this note permanently?</span>
            <button onClick={deleteNote} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT }}>Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{ background: 'transparent', border: '1px solid var(--sh-border, #e2e8f0)', color: 'var(--sh-muted, #64748b)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT, transition: 'background .15s' }}>
            Delete Note
          </button>
        )}
      </div>
    </div>
  ) : (
    /* Empty state when no note selected (desktop only) */
    !layout.isPhone && (
      <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 16, border: '2px dashed var(--sh-border, #cbd5e1)', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 8 }}>
          Select a note to edit
        </div>
        <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.6 }}>
          Choose a note from the list or create a new one.
          <br />
          Notes support <strong>full markdown</strong> with live preview.
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
