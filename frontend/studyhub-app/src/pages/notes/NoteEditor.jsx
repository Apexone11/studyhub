/* ═══════════════════════════════════════════════════════════════════════════
 * NoteEditor.jsx — Note editing/creation component with markdown toolbar
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react'
import { API } from '../../config'
import { PAGE_FONT, authHeaders } from '../shared/pageUtils'
import { TOOLBAR_ACTIONS, applyToolbarAction, MarkdownPreview, wordCount } from './notesConstants'
import NoteVersionHistory from './NoteVersionHistory'
import NoteTagsInput from './NoteTagsInput'

export default function NoteEditor({
  activeNote,
  editorTitle,
  editorContent,
  editorPrivate,
  editorAllowDownloads,
  editorCourseId,
  courses,
  saving,
  confirmDelete,
  setConfirmDelete,
  handleTitleChange,
  handleContentChange,
  handlePrivateChange,
  handleAllowDownloadsChange,
  handleCourseChange,
  deleteNote,
  setActiveNote,
  toggleStar,
  togglePin,
  handleRestore,
  layout,
}) {
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [showVersions, setShowVersions] = useState(false)
  const [uploading, setUploading] = useState(false)

  /* ── Image upload handler ──────────────────────────────────────── */
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !activeNote) return
    e.target.value = '' // reset for re-upload of same file

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)

      // authHeaders() returns { 'Content-Type': 'application/json', ... }
      // For FormData, we need the token but NOT Content-Type (browser sets multipart boundary)
      const headers = authHeaders()
      delete headers['Content-Type']

      const res = await fetch(`${API}/api/notes/${activeNote.id}/images`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed')
      }
      const { markdown } = await res.json()
      // Insert markdown image syntax at cursor position
      const textarea = editorRef.current
      if (textarea) {
        const pos = textarea.selectionStart || editorContent.length
        const newContent = editorContent.slice(0, pos) + '\n' + markdown + '\n' + editorContent.slice(pos)
        handleContentChange(newContent)
      }
    } catch (err) {
      alert(err.message || 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (!activeNote) {
    /* Empty state when no note selected (desktop only) */
    if (layout.isPhone) return null
    return (
      <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 16, border: '2px dashed var(--sh-border, #cbd5e1)', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--sh-brand-bg, #eff6ff), var(--sh-soft, #dbeafe))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: 'var(--sh-brand)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          aria-label="Back to notes list"
          style={{ background: 'none', border: 'none', color: 'var(--sh-brand)', fontSize: 13, cursor: 'pointer', fontFamily: PAGE_FONT, marginBottom: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
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
          background: editorPrivate ? 'var(--sh-soft, #f1f5f9)' : 'var(--sh-success-bg, #dcfce7)',
          color: editorPrivate ? 'var(--sh-muted, #64748b)' : 'var(--sh-success-text, #16a34a)',
          fontWeight: 600, transition: 'all .15s',
        }}>
          <input type="checkbox" checked={editorPrivate} onChange={(e) => handlePrivateChange(e.target.checked)} style={{ accentColor: 'var(--sh-brand)' }} />
          {editorPrivate ? 'Private' : 'Shared'}
        </label>
        {!editorPrivate && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer',
            padding: '4px 10px', borderRadius: 8,
            background: editorAllowDownloads ? 'var(--sh-info-bg, #dbeafe)' : 'var(--sh-soft, #f1f5f9)',
            color: editorAllowDownloads ? 'var(--sh-info-text, #2563eb)' : 'var(--sh-muted, #64748b)',
            fontWeight: 600, transition: 'all .15s',
          }}>
            <input type="checkbox" checked={editorAllowDownloads || false} onChange={(e) => handleAllowDownloadsChange(e.target.checked)} style={{ accentColor: 'var(--sh-brand)' }} />
            Downloads
          </label>
        )}
        {/* Star button */}
        <button
          onClick={() => toggleStar?.(activeNote.id)}
          title={activeNote._starred ? 'Unstar note' : 'Star note'}
          aria-label={activeNote._starred ? 'Unstar note' : 'Star note'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
            fontSize: 11, lineHeight: 1, fontWeight: 600, color: activeNote._starred ? 'var(--sh-warning-text, #f59e0b)' : 'var(--sh-muted)',
            transition: 'color .15s', fontFamily: PAGE_FONT,
          }}
        >
          {activeNote._starred ? 'Starred' : 'Star'}
        </button>
        {/* Pin button */}
        <button
          onClick={() => togglePin?.(activeNote.id)}
          title={activeNote.pinned ? 'Unpin note' : 'Pin note'}
          aria-label={activeNote.pinned ? 'Unpin note' : 'Pin note'}
          style={{
            background: activeNote.pinned ? 'var(--sh-brand-soft, #eff6ff)' : 'none',
            border: activeNote.pinned ? '1px solid var(--sh-brand)' : '1px solid transparent',
            borderRadius: 6, cursor: 'pointer', padding: '3px 8px',
            fontSize: 11, fontWeight: 600, fontFamily: PAGE_FONT,
            color: activeNote.pinned ? 'var(--sh-brand)' : 'var(--sh-muted)',
            transition: 'all .15s',
          }}
        >
          {activeNote.pinned ? 'Pinned' : 'Pin'}
        </button>
        {/* Version history button */}
        <button
          onClick={() => setShowVersions(true)}
          title="Version history"
          aria-label="Show version history"
          style={{
            background: 'none', border: '1px solid var(--sh-border)', borderRadius: 6,
            cursor: 'pointer', padding: '3px 8px', fontSize: 11, fontWeight: 600,
            fontFamily: PAGE_FONT, color: 'var(--sh-muted)', transition: 'all .15s',
          }}
        >
          History
        </button>
        <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving
            ? <span style={{ color: 'var(--sh-muted)' }}>Saving…</span>
            : <span style={{ color: 'var(--sh-success, #10b981)', fontWeight: 600 }}>✓ Saved</span>
          }
        </div>
      </div>

      {/* Tags input */}
      <div style={{
        background: 'var(--sh-surface)', borderRadius: 10, border: '1px solid var(--sh-border)',
        padding: '8px 14px', marginBottom: 10,
      }}>
        <NoteTagsInput noteId={activeNote.id} initialTags={(() => { try { return JSON.parse(activeNote.tags || '[]') } catch { return [] } })()} />
      </div>

      {/* Version history panel */}
      {showVersions && (
        <NoteVersionHistory
          noteId={activeNote.id}
          onRestore={(restored) => { handleRestore?.(restored); setShowVersions(false) }}
          onClose={() => setShowVersions(false)}
        />
      )}

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
          {/* Separator before image upload */}
          <div style={{ width: 1, height: 20, background: 'var(--sh-border, #e2e8f0)', margin: '0 6px' }} />
          {/* Image upload button */}
          <button
            type="button"
            title="Upload image"
            aria-label="Upload image"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 34, height: 32, display: 'grid', placeItems: 'center',
              border: '1px solid transparent', background: 'transparent', borderRadius: 8,
              cursor: uploading ? 'wait' : 'pointer', color: 'var(--sh-muted, #475569)',
              transition: 'all .15s', fontSize: 10, fontWeight: 600, fontFamily: PAGE_FONT, opacity: uploading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!uploading) { e.currentTarget.style.background = 'var(--sh-border, #e2e8f0)'; e.currentTarget.style.color = 'var(--sh-text, #0f172a)'; e.currentTarget.style.borderColor = 'var(--sh-border, #cbd5e1)' } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sh-muted, #475569)'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            {uploading ? '...' : 'IMG'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--sh-subtext, #94a3b8)', fontWeight: 600, padding: '4px 8px', background: 'var(--sh-surface, #fff)', borderRadius: 6, border: '1px solid var(--sh-border, #e2e8f0)' }}>
            {wordCount(editorContent)} words
          </span>
        </div>

        {/* Editor + Preview split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {/* Column headers */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--sh-border, #e2e8f0)', borderRight: '1px solid var(--sh-border, #e2e8f0)', fontSize: 11, fontWeight: 700, color: 'var(--sh-brand)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sh-brand)' }} />
            Write
          </div>
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--sh-border, #e2e8f0)', fontSize: 11, fontWeight: 700, color: 'var(--sh-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sh-success, #10b981)' }} />
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
          <div data-note-preview style={{ padding: '18px 22px', overflowY: 'auto', maxHeight: 580 }}>
            <MarkdownPreview content={editorContent} />
          </div>
        </div>
      </div>

      {/* Footer: export + delete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <button
          onClick={() => {
            // Open a new window with the rendered markdown for print/PDF
            const printWin = window.open('', '_blank', 'width=800,height=600')
            if (!printWin) return
            const previewEl = document.querySelector('[data-note-preview]')
            const previewHtml = previewEl ? previewEl.innerHTML : '<p>No content to export.</p>'
            printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${editorTitle || 'Note'}</title><style>
body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 24px; color: #1e293b; line-height: 1.7; }
h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
h2 { font-size: 20px; font-weight: 700; }
h3 { font-size: 16px; font-weight: 700; }
pre { background: #f1f5f9; border-radius: 8px; padding: 14px; overflow-x: auto; font-size: 13px; }
code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #3b82f6; margin: 12px 0; padding: 8px 16px; color: #475569; }
img { max-width: 100%; border-radius: 8px; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
@media print { body { margin: 0; } }
</style></head><body><h1>${editorTitle || 'Untitled Note'}</h1>${previewHtml}</body></html>`)
            printWin.document.close()
            setTimeout(() => printWin.print(), 300)
          }}
          aria-label="Export as PDF"
          style={{
            background: 'var(--sh-soft, #f1f5f9)', border: '1px solid var(--sh-border, #e2e8f0)',
            color: 'var(--sh-muted, #64748b)', borderRadius: 8, padding: '7px 16px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT,
            transition: 'background .15s', display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          PDF
        </button>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--sh-danger)', fontWeight: 600 }}>Delete this note permanently?</span>
            <button onClick={deleteNote} style={{ background: 'var(--sh-danger)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT }}>Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{ background: 'transparent', border: '1px solid var(--sh-border, #e2e8f0)', color: 'var(--sh-muted, #64748b)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: PAGE_FONT }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} aria-label="Delete note" style={{ background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger)', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT, transition: 'background .15s' }}>
            Delete Note
          </button>
        )}
      </div>
    </div>
  )
}
