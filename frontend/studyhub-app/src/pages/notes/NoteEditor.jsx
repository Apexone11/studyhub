/* ═══════════════════════════════════════════════════════════════════════════
 * NoteEditor.jsx — Note editing/creation component with markdown toolbar
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef } from 'react'
import { PAGE_FONT } from '../shared/pageUtils'
import { TOOLBAR_ACTIONS, applyToolbarAction, MarkdownPreview, wordCount } from './notesConstants'

export default function NoteEditor({
  activeNote,
  editorTitle,
  editorContent,
  editorPrivate,
  editorCourseId,
  courses,
  saving,
  confirmDelete,
  setConfirmDelete,
  handleTitleChange,
  handleContentChange,
  handlePrivateChange,
  handleCourseChange,
  deleteNote,
  setActiveNote,
  layout,
}) {
  const editorRef = useRef(null)

  if (!activeNote) {
    /* Empty state when no note selected (desktop only) */
    if (layout.isPhone) return null
    return (
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
  }

  return (
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

      {/* Markdown editor with live preview */}
      <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 14, border: '1px solid var(--sh-border, #e2e8f0)', overflow: 'hidden', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 1, padding: '8px 14px',
          borderBottom: '1px solid var(--sh-border, #e2e8f0)',
          background: 'var(--sh-soft, #f8fafc)',
          flexWrap: 'wrap',
        }}>
          {TOOLBAR_ACTIONS.map((action) => action.sep ? (
            <div key={action.key} style={{ width: 1, height: 20, background: 'var(--sh-border, #e2e8f0)', margin: '0 6px' }} />
          ) : (
            <button
              key={action.key}
              type="button"
              title={action.title}
              onClick={() => applyToolbarAction(editorRef, action, editorContent, handleContentChange)}
              style={{
                width: 34, height: 32, display: 'grid', placeItems: 'center',
                border: '1px solid transparent', background: 'transparent', borderRadius: 8,
                cursor: 'pointer', color: 'var(--sh-muted, #475569)',
                transition: 'all .15s',
                ...action.style,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sh-border, #e2e8f0)'; e.currentTarget.style.color = 'var(--sh-text, #0f172a)'; e.currentTarget.style.borderColor = 'var(--sh-border, #cbd5e1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sh-muted, #475569)'; e.currentTarget.style.borderColor = 'transparent' }}
            >
              {action.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--sh-subtext, #94a3b8)', fontWeight: 600, padding: '4px 8px', background: 'var(--sh-surface, #fff)', borderRadius: 6, border: '1px solid var(--sh-border, #e2e8f0)' }}>
            {wordCount(editorContent)} words
          </span>
        </div>

        {/* Editor + Preview split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {/* Column headers */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--sh-border, #e2e8f0)', borderRight: '1px solid var(--sh-border, #e2e8f0)', fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
            Write
          </div>
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--sh-border, #e2e8f0)', fontSize: 11, fontWeight: 700, color: 'var(--sh-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            Preview
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 480 }}>
          {/* Write pane */}
          <div style={{ borderRight: '1px solid var(--sh-border, #e2e8f0)' }}>
            <textarea
              ref={editorRef}
              value={editorContent}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
              placeholder={'Write your notes in markdown…\n\n# Heading\n**bold** _italic_ `code`\n- bullet list\n1. numbered list\n> blockquote'}
              onKeyDown={(e) => {
                // Tab key inserts 2 spaces
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const start = e.target.selectionStart
                  const end = e.target.selectionEnd
                  const val = editorContent
                  handleContentChange(val.slice(0, start) + '  ' + val.slice(end))
                  requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = start + 2 })
                }
                // Keyboard shortcuts: Ctrl+B, Ctrl+I, Ctrl+H, Ctrl+K
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                  const action = TOOLBAR_ACTIONS.find((a) => a.shortcut === e.key.toLowerCase())
                  if (action) {
                    e.preventDefault()
                    applyToolbarAction(editorRef, action, editorContent, handleContentChange)
                  }
                }
              }}
              style={{
                width: '100%', height: '100%', minHeight: 480,
                background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', padding: '18px 20px',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontSize: 13.5, lineHeight: 1.9,
                color: 'var(--sh-text, #1e293b)',
                boxSizing: 'border-box',
                letterSpacing: '0.01em',
              }}
            />
          </div>
          {/* Preview pane */}
          <div style={{ padding: '18px 22px', overflowY: 'auto', maxHeight: 580 }}>
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
  )
}
