/* ═══════════════════════════════════════════════════════════════════════════
 * NoteEditor.jsx — Note editing/creation component with TipTap rich text
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { MathInline, MathBlock } from '../../components/editor/MathExtension'
import { lowlight } from '../../components/editor/codeHighlight'
import EditorToolbar from '../../components/editor/EditorToolbar'
import { PAGE_FONT } from '../shared/pageUtils'
import NoteVersionHistory from './NoteVersionHistory'
import NoteTagsInput from './NoteTagsInput'
import { useNotePersistence } from './useNotePersistence.js'
import NoteSaveStatus from './NoteSaveStatus.jsx'
import NoteConflictBanner from './NoteConflictBanner.jsx'
import ConflictCompareModal from './ConflictCompareModal.jsx'
import { sanitizePastedHtml } from './notePaste.js'
import { useNotesHardeningEnabled } from './useNotesHardeningFlag.js'
import '../../components/editor/richTextEditor.css'

function getNoteTags(tagsValue) {
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

/* ── Configure marked for backward-compat conversion ────────── */
marked.setOptions({ breaks: true, gfm: true })

/* ── Detect whether content is markdown vs HTML ─────────────── */
function isMarkdown(content) {
  if (!content || !content.trim()) return false
  const trimmed = content.trim()
  // Detect actual HTML tags (not autolinks like <https://...> or <user@email>)
  // Match tags like <p>, <div>, <h1>, <br/>, etc. but not <http or <mailto
  if (!/<[a-z][a-z0-9-]*[\s>/]/i.test(trimmed) || /^<https?:\/\//.test(trimmed)) return true
  // If it starts with common markdown patterns, treat as markdown
  if (/^[#*\-+>`|![]/.test(trimmed)) return true
  return false
}

/* ── Convert markdown content to sanitized HTML ─────────────── */
function markdownToHtml(content) {
  if (!content?.trim()) return ''
  const raw = marked.parse(content)
  return DOMPurify.sanitize(raw)
}

/* ── Word count from HTML text content ──────────────────────── */
function htmlWordCount(html) {
  if (!html?.trim()) return 0
  // Strip tags, decode entities, count words
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const text = tmp.textContent || tmp.innerText || ''
  if (!text.trim()) return 0
  return text.trim().split(/\s+/).length
}

/* ═══════════════════════════════════════════════════════════════
 * NoteRichEditor — TipTap wrapper with theme-aware note styling
 * and backward-compatible markdown-to-HTML conversion
 * ═══════════════════════════════════════════════════════════════ */
function NoteRichEditor({ content, onUpdate, noteId, sanitizePaste }) {
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  })
  const sanitizePasteRef = useRef(sanitizePaste)
  useEffect(() => {
    sanitizePasteRef.current = sanitizePaste
  })

  // Convert markdown on first load per note
  const initialContent = useMemo(() => {
    if (isMarkdown(content)) return markdownToHtml(content)
    return content || ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4] },
        history: { depth: 100 },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
          class: 'sh-editor-link',
        },
        validate: (href) => /^https?:\/\/|^mailto:/i.test(href),
      }),
      Placeholder.configure({ placeholder: 'Start writing your notes...' }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'sh-editor-image',
          loading: 'lazy',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: null,
        HTMLAttributes: {
          class: 'sh-editor-code-block',
        },
      }),
      MathInline,
      MathBlock,
    ],
    content: initialContent,
    editable: true,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      // Treat empty editor as empty string
      const cleaned = !html || html === '<p></p>' ? '' : html
      onUpdateRef.current?.(cleaned)
    },
    editorProps: {
      attributes: {
        class: 'sh-rich-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Note content editor',
      },
      handlePaste: () => false, // Allow default TipTap paste — sanitized on save
      transformPastedHTML: (html) => {
        const fn = sanitizePasteRef.current
        if (typeof fn !== 'function') return html
        try {
          const out = fn(html)
          return typeof out === 'string' ? out : html
        } catch {
          return html
        }
      },
    },
  })

  // Sync content when switching notes (noteId change)
  const lastNoteId = useRef(noteId)
  useEffect(() => {
    if (!editor) return
    if (noteId !== lastNoteId.current) {
      lastNoteId.current = noteId
      const htmlContent = isMarkdown(content) ? markdownToHtml(content) : content || ''
      editor.commands.setContent(htmlContent, false)
    }
  }, [noteId, content, editor])

  return (
    <div
      className="sh-note-editor-wrap"
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 12,
        border: '1px solid var(--sh-border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar — theme-aware via CSS class override */}
      <div className="sh-note-editor-toolbar">
        <EditorToolbar editor={editor} />
      </div>

      {/* Editor content area */}
      <div
        style={{
          flex: 1,
          minHeight: 300,
          overflow: 'auto',
          background: 'var(--sh-surface)',
        }}
      >
        <EditorContent editor={editor} style={{ height: '100%' }} />
      </div>

      {/* Word count footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '6px 14px',
          borderTop: '1px solid var(--sh-border)',
          background: 'var(--sh-soft)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: 'var(--sh-subtext)',
            fontWeight: 600,
            padding: '2px 8px',
            background: 'var(--sh-surface)',
            borderRadius: 6,
            border: '1px solid var(--sh-border)',
          }}
        >
          {htmlWordCount(editor?.getHTML?.() || '')} words
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * NoteEditor — Main editor component
 * ═══════════════════════════════════════════════════════════════ */
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
  handleTagsChange,
  layout,
}) {
  const [showVersions, setShowVersions] = useState(false)
  const hardeningEnabled = useNotesHardeningEnabled()
  // Always call the hook (rules-of-hooks); short-circuits internally when noteId is null.
  const persistence = useNotePersistence(hardeningEnabled ? (activeNote?.id ?? null) : null)
  const [showConflictDiff, setShowConflictDiff] = useState(false)

  // Keep refs to latest title/content so persistence callbacks see fresh values.
  const latestTitleRef = useRef(editorTitle ?? '')
  const latestContentRef = useRef(editorContent ?? '')
  useEffect(() => {
    latestTitleRef.current = editorTitle ?? ''
  }, [editorTitle])
  useEffect(() => {
    latestContentRef.current = editorContent ?? ''
  }, [editorContent])

  const wrappedTitleChange = (value) => {
    handleTitleChange?.(value)
    if (hardeningEnabled && activeNote?.id) {
      latestTitleRef.current = value ?? ''
      persistence.onEditorChange(value ?? '', latestContentRef.current ?? '')
    }
  }

  const wrappedContentChange = (html) => {
    handleContentChange?.(html)
    if (hardeningEnabled && activeNote?.id) {
      latestContentRef.current = html ?? ''
      persistence.onEditorChange(latestTitleRef.current ?? '', html ?? '')
    }
  }

  // Ctrl/Cmd+S -> manual save (or open conflict diff if conflicted)
  useEffect(() => {
    if (!hardeningEnabled) return undefined
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        if (persistence.state?.status === 'conflict') setShowConflictDiff(true)
        else persistence.saveNow?.('manual')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hardeningEnabled, persistence])

  if (!activeNote) {
    /* Empty state when no note selected (desktop only) */
    if (layout.isPhone) return null
    return (
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 16,
          border: '2px dashed var(--sh-border)',
          padding: '64px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, var(--sh-brand-bg, #eff6ff), var(--sh-soft))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            color: 'var(--sh-brand)',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 8 }}>
          Select a note to edit
        </div>
        <div style={{ fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          Choose a note from the list or create a new one.
          <br />
          Notes support <strong>rich text editing</strong> with formatting toolbar.
        </div>
      </div>
    )
  }

  return (
    <div data-testid="note-editor">
      {/* Back button (phone only) */}
      {layout.isPhone && (
        <button
          onClick={() => setActiveNote(null)}
          aria-label="Back to notes list"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--sh-brand)',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: PAGE_FONT,
            marginBottom: 12,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontWeight: 600,
          }}
        >
          &larr; All Notes
        </button>
      )}

      {/* Title bar with metadata controls */}
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 14,
          border: '1px solid var(--sh-border)',
          padding: '14px 18px',
          marginBottom: 10,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={editorTitle}
          onChange={(e) => wrappedTitleChange(e.target.value)}
          placeholder="Note title..."
          style={{
            flex: '1 1 200px',
            border: 'none',
            outline: 'none',
            fontSize: 18,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            fontFamily: PAGE_FONT,
            minWidth: 120,
            background: 'transparent',
          }}
        />
        <select
          value={editorCourseId}
          onChange={(e) => handleCourseChange(e.target.value)}
          style={{
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontFamily: PAGE_FONT,
            color: 'var(--sh-muted)',
            outline: 'none',
            background: 'var(--sh-surface)',
          }}
        >
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.code}
            </option>
          ))}
        </select>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 8,
            background: editorPrivate ? 'var(--sh-soft)' : 'var(--sh-success-bg)',
            color: editorPrivate ? 'var(--sh-muted)' : 'var(--sh-success-text)',
            fontWeight: 600,
            transition: 'all .15s',
          }}
        >
          <input
            type="checkbox"
            checked={editorPrivate}
            onChange={(e) => handlePrivateChange(e.target.checked)}
            style={{ accentColor: 'var(--sh-brand)' }}
          />
          {editorPrivate ? 'Private' : 'Shared'}
        </label>
        {!editorPrivate && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 8,
              background: editorAllowDownloads ? 'var(--sh-info-bg, #dbeafe)' : 'var(--sh-soft)',
              color: editorAllowDownloads ? 'var(--sh-info-text, #2563eb)' : 'var(--sh-muted)',
              fontWeight: 600,
              transition: 'all .15s',
            }}
          >
            <input
              type="checkbox"
              checked={editorAllowDownloads || false}
              onChange={(e) => handleAllowDownloadsChange(e.target.checked)}
              style={{ accentColor: 'var(--sh-brand)' }}
            />
            Downloads
          </label>
        )}
        {/* Star button */}
        <button
          onClick={() => toggleStar?.(activeNote.id)}
          title={activeNote._starred ? 'Unstar note' : 'Star note'}
          aria-label={activeNote._starred ? 'Unstar note' : 'Star note'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            fontSize: 11,
            lineHeight: 1,
            fontWeight: 600,
            color: activeNote._starred ? 'var(--sh-warning-text, #f59e0b)' : 'var(--sh-muted)',
            transition: 'color .15s',
            fontFamily: PAGE_FONT,
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
            borderRadius: 6,
            cursor: 'pointer',
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: PAGE_FONT,
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
            background: 'none',
            border: '1px solid var(--sh-border)',
            borderRadius: 6,
            cursor: 'pointer',
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: PAGE_FONT,
            color: 'var(--sh-muted)',
            transition: 'all .15s',
          }}
        >
          History
        </button>
        <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          {hardeningEnabled ? (
            <NoteSaveStatus
              status={persistence.state?.status}
              lastSavedAt={persistence.state?.lastSavedAt}
              onRetry={() => persistence.saveNow?.('manual')}
              onOpenConflict={() => setShowConflictDiff(true)}
              onSaveNow={() => persistence.saveNow?.('manual')}
            />
          ) : saving ? (
            <span style={{ color: 'var(--sh-muted)' }}>Saving...</span>
          ) : (
            <span style={{ color: 'var(--sh-success)', fontWeight: 600 }}>Saved</span>
          )}
        </div>
      </div>

      {/* Conflict banner + compare modal (hardening v2) */}
      {hardeningEnabled && persistence.state?.status === 'conflict' && (
        <div style={{ marginBottom: 10 }}>
          <NoteConflictBanner
            onKeepMine={() => persistence.resolveConflict?.('keep-mine')}
            onTakeTheirs={() => persistence.resolveConflict?.('take-server')}
            onCompare={() => setShowConflictDiff(true)}
          />
        </div>
      )}
      {hardeningEnabled && showConflictDiff && persistence.state?.pendingConflict && (
        <ConflictCompareModal
          yours={persistence.state.pendingConflict.yours}
          current={persistence.state.pendingConflict.current}
          onClose={() => setShowConflictDiff(false)}
          onKeepMine={() => {
            persistence.resolveConflict?.('keep-mine')
            setShowConflictDiff(false)
          }}
          onTakeTheirs={() => {
            persistence.resolveConflict?.('take-server')
            setShowConflictDiff(false)
          }}
        />
      )}

      {/* Tags input */}
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 10,
          border: '1px solid var(--sh-border)',
          padding: '8px 14px',
          marginBottom: 10,
        }}
      >
        <NoteTagsInput
          noteId={activeNote.id}
          initialTags={getNoteTags(activeNote.tags)}
          onTagsChange={(tags) => handleTagsChange?.(activeNote.id, tags)}
        />
      </div>

      {/* Version history panel */}
      {showVersions && (
        <NoteVersionHistory
          noteId={activeNote.id}
          onRestore={(restored) => {
            handleRestore?.(restored)
            setShowVersions(false)
          }}
          onClose={() => setShowVersions(false)}
        />
      )}

      {/* TipTap rich text editor */}
      <div style={{ marginBottom: 10 }}>
        <NoteRichEditor
          content={editorContent}
          noteId={activeNote.id}
          onUpdate={wrappedContentChange}
          sanitizePaste={hardeningEnabled ? sanitizePastedHtml : null}
        />
      </div>

      {/* Footer: export + delete */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <button
          onClick={() => {
            const printWin = window.open('', '_blank', 'width=800,height=600')
            if (!printWin) return
            // For the rich editor, content is already HTML
            const exportHtml = DOMPurify.sanitize(editorContent || '<p>No content to export.</p>')
            const safeTitle = (editorTitle || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
            printWin.document
              .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle || 'Note'}</title><style>
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
ul { list-style-type: disc; padding-left: 1.5em; }
ol { list-style-type: decimal; padding-left: 1.5em; }
a { color: #2563eb; }
@media print { body { margin: 0; } }
</style></head><body><h1>${safeTitle || 'Untitled Note'}</h1>${exportHtml}</body></html>`)
            printWin.document.close()
            setTimeout(() => printWin.print(), 300)
          }}
          aria-label="Export as PDF"
          style={{
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            color: 'var(--sh-muted)',
            borderRadius: 8,
            padding: '7px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: PAGE_FONT,
            transition: 'background .15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          PDF
        </button>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--sh-danger)', fontWeight: 600 }}>
              Delete this note permanently?
            </span>
            <button
              onClick={deleteNote}
              style={{
                background: 'var(--sh-danger)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: PAGE_FONT,
              }}
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                background: 'transparent',
                border: '1px solid var(--sh-border)',
                color: 'var(--sh-muted)',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: PAGE_FONT,
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete note"
            style={{
              background: 'var(--sh-danger-bg)',
              border: '1px solid var(--sh-danger-border)',
              color: 'var(--sh-danger)',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
              transition: 'background .15s',
            }}
          >
            Delete Note
          </button>
        )}
      </div>
    </div>
  )
}
