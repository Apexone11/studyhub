/**
 * EditorToolbar — formatting toolbar for the TipTap rich text editor.
 * Provides heading, text formatting, list, link, and block-level controls.
 * Uses StudyHub design tokens for consistent dark-mode-editor styling.
 */
import { useCallback, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../../pages/sheets/lab/sheetLabConstants'
import { showToast } from '../../lib/toast'

/* ── Toolbar button component ──────────────────────────────── */

function ToolbarButton({ onClick, active, disabled, title, children, style: extraStyle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 28,
        borderRadius: 6,
        border: 'none',
        background: active ? 'var(--sh-brand)' : 'transparent',
        color: active ? 'var(--sh-nav-text)' : 'var(--sh-muted)',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.12s, color 0.12s',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        ...extraStyle,
      }}
    >
      {children}
    </button>
  )
}

/* ── Toolbar separator ─────────────────────────────────────── */

function Separator() {
  return (
    <div
      role="separator"
      style={{ width: 1, height: 18, background: '#334155', margin: '0 4px', flexShrink: 0 }}
    />
  )
}

/* ── Link input popover ────────────────────────────────────── */

function LinkPopover({ onSubmit, onCancel, initialUrl }) {
  const [url, setUrl] = useState(initialUrl || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (trimmed) {
      // Basic URL validation — only allow http/https/mailto
      if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
        onSubmit(trimmed)
      } else {
        onSubmit(`https://${trimmed}`)
      }
    } else {
      onCancel()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 20,
        padding: '8px 10px',
        borderRadius: 10,
        background: '#1e293b',
        border: '1px solid #334155',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        marginTop: 4,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com"
        autoFocus
        style={{
          width: 220,
          padding: '5px 8px',
          borderRadius: 6,
          border: '1px solid #475569',
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        style={{
          padding: '5px 10px',
          borderRadius: 6,
          border: 'none',
          background: 'var(--sh-brand)',
          color: 'var(--sh-nav-text)',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Set
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: '5px 8px',
          borderRadius: 6,
          border: '1px solid #475569',
          background: 'transparent',
          color: '#94a3b8',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Cancel
      </button>
    </form>
  )
}

/* ── Main EditorToolbar ────────────────────────────────────── */

export default function EditorToolbar({ editor, themeAware = false }) {
  const [showLinkInput, setShowLinkInput] = useState(false)

  const setLink = useCallback(
    (url) => {
      if (!editor) return
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      setShowLinkInput(false)
    },
    [editor],
  )

  const removeLink = useCallback(() => {
    if (!editor) return
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setShowLinkInput(false)
  }, [editor])

  const insertInlineMath = useCallback(() => {
    if (!editor) return
    const latex = prompt('Enter LaTeX (inline math):')
    if (latex !== null && latex.trim()) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mathInline',
          attrs: { latex: latex.trim() },
        })
        .run()
    }
  }, [editor])

  const insertBlockMath = useCallback(() => {
    if (!editor) return
    const latex = prompt('Enter LaTeX (block/display math):')
    if (latex !== null && latex.trim()) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mathBlock',
          attrs: { latex: latex.trim() },
        })
        .run()
    }
  }, [editor])

  // Image upload via hidden file input
  const imageInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleImageSelect = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file || !editor) return
      // Reset input so re-selecting the same file works
      e.target.value = ''

      // Client-side validation
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file.', 'error')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be 5 MB or smaller.', 'error')
        return
      }

      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        const headers = authHeaders()
        // Remove Content-Type — fetch will set multipart boundary automatically
        delete headers['Content-Type']
        const response = await fetch(`${API}/api/upload/content-image`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: formData,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Upload failed.')

        // Insert image into editor at current cursor position
        const imageUrl = data.url.startsWith('http') ? data.url : `${API}${data.url}`
        editor
          .chain()
          .focus()
          .setImage({
            src: imageUrl,
            alt: file.name.replace(/\.[^.]+$/, ''),
          })
          .run()
      } catch (err) {
        showToast(err.message || 'Image upload failed.', 'error')
      } finally {
        setUploading(false)
      }
    },
    [editor],
  )

  if (!editor) return null

  const isLink = editor.isActive('link')

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        padding: '6px 10px',
        background: themeAware ? 'var(--sh-soft)' : '#1e293b',
        borderBottom: themeAware ? '1px solid var(--sh-border)' : '1px solid #334155',
        position: 'relative',
      }}
    >
      {/* Heading levels */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolbarButton>

      <Separator />

      {/* Inline formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
        style={{ fontWeight: 900 }}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
        style={{ fontStyle: 'italic' }}
      >
        I
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline (Ctrl+U)"
        style={{ textDecoration: 'underline' }}
      >
        U
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
        style={{ textDecoration: 'line-through' }}
      >
        S
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="Inline code"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
      >
        {'<>'}
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3.5" cy="6" r="1" fill="currentColor" />
          <circle cx="3.5" cy="12" r="1" fill="currentColor" />
          <circle cx="3.5" cy="18" r="1" fill="currentColor" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered list"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <text
            x="2"
            y="8"
            fill="currentColor"
            stroke="none"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui"
          >
            1
          </text>
          <text
            x="2"
            y="14"
            fill="currentColor"
            stroke="none"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui"
          >
            2
          </text>
          <text
            x="2"
            y="20"
            fill="currentColor"
            stroke="none"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui"
          >
            3
          </text>
        </svg>
      </ToolbarButton>

      <Separator />

      {/* Block-level */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.7 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.228 0-2.35-.587-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.7 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.228 0-2.35-.587-2.917-1.179z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code block"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      </ToolbarButton>

      <Separator />

      {/* Link */}
      <ToolbarButton
        onClick={() => {
          if (isLink) {
            removeLink()
          } else {
            setShowLinkInput((v) => !v)
          }
        }}
        active={isLink}
        title={isLink ? 'Remove link' : 'Insert link'}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarButton>

      {/* Math (KaTeX) */}
      <Separator />
      <ToolbarButton
        onClick={insertInlineMath}
        title="Insert inline math ($...$)"
        style={{ fontFamily: 'serif', fontStyle: 'italic', fontSize: 14 }}
      >
        <span aria-hidden="true">x</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={insertBlockMath}
        title="Insert block math ($$...$$)"
        style={{ fontFamily: 'serif', fontSize: 11 }}
      >
        <svg
          width="16"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <text
            x="4"
            y="16"
            fill="currentColor"
            stroke="none"
            fontSize="14"
            fontFamily="serif"
            fontStyle="italic"
          >
            &#x03A3;
          </text>
        </svg>
      </ToolbarButton>

      {/* Image upload */}
      <Separator />
      <ToolbarButton
        onClick={() => imageInputRef.current?.click()}
        disabled={uploading}
        title={uploading ? 'Uploading image...' : 'Insert image'}
      >
        {uploading ? (
          <span style={{ fontSize: 10 }}>...</span>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
      </ToolbarButton>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleImageSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Undo / Redo */}
      <Separator />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      </ToolbarButton>

      {/* Link input popover */}
      {showLinkInput && (
        <LinkPopover
          initialUrl={editor.getAttributes('link').href || ''}
          onSubmit={setLink}
          onCancel={() => setShowLinkInput(false)}
        />
      )}
    </div>
  )
}
