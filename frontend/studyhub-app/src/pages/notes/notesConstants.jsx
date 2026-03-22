/* ═══════════════════════════════════════════════════════════════════════════
 * notesConstants.js — Constants, toolbar actions, and helpers for NotesPage
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/* ── Configure marked for safe rendering ─────────────────────────────── */
marked.setOptions({
  breaks: true,
  gfm: true,
})

/* ── Markdown toolbar actions ────────────────────────────────────────── */
export const TOOLBAR_ACTIONS = [
  { key: 'bold', label: 'B', title: 'Bold (Ctrl+B)', shortcut: 'b', before: '**', after: '**', style: { fontWeight: 800, fontSize: 14 } },
  { key: 'italic', label: 'I', title: 'Italic (Ctrl+I)', shortcut: 'i', before: '_', after: '_', style: { fontStyle: 'italic', fontSize: 14 } },
  { key: 'h2', label: 'H', title: 'Heading (Ctrl+H)', shortcut: 'h', before: '## ', after: '', style: { fontWeight: 800, fontSize: 14 } },
  { key: 'sep1', sep: true },
  { key: 'ul', label: '•', title: 'Bullet list', before: '- ', after: '', style: { fontSize: 18, lineHeight: '14px' } },
  { key: 'ol', label: '1.', title: 'Numbered list', before: '1. ', after: '', style: { fontSize: 12, fontWeight: 700 } },
  { key: 'sep2', sep: true },
  { key: 'code', label: '</>', title: 'Inline code', before: '`', after: '`', style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 700 } },
  { key: 'codeblock', label: '{ }', title: 'Code block', before: '```\n', after: '\n```', style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 700 } },
  { key: 'link', label: '🔗', title: 'Link (Ctrl+K)', shortcut: 'k', before: '[', after: '](url)', style: { fontSize: 13 } },
  { key: 'quote', label: '❝', title: 'Blockquote', before: '> ', after: '', style: { fontSize: 15, lineHeight: '14px' } },
]

/* ── Apply a toolbar action to the textarea ──────────────────────────── */
export function applyToolbarAction(textareaRef, action, content, onChange) {
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
export function MarkdownPreview({ content }) {
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
export function wordCount(text) {
  if (!text?.trim()) return 0
  return text.trim().split(/\s+/).length
}
