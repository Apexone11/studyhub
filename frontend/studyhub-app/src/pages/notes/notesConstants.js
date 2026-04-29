/* ═══════════════════════════════════════════════════════════════════════════
 * notesConstants.js — Constants, toolbar actions, and helpers for NotesPage.
 *
 * The MarkdownPreview component lives in notesComponents.jsx and is
 * re-exported here for backward-compatible imports.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { marked } from 'marked'

/* ── Configure marked for safe rendering ─────────────────────────────── */
marked.setOptions({
  breaks: true,
  gfm: true,
})

/* ── Markdown toolbar actions ────────────────────────────────────────── */
export const TOOLBAR_ACTIONS = [
  {
    key: 'bold',
    label: 'B',
    title: 'Bold (Ctrl+B)',
    shortcut: 'b',
    before: '**',
    after: '**',
    style: { fontWeight: 800, fontSize: 14 },
  },
  {
    key: 'italic',
    label: 'I',
    title: 'Italic (Ctrl+I)',
    shortcut: 'i',
    before: '_',
    after: '_',
    style: { fontStyle: 'italic', fontSize: 14 },
  },
  {
    key: 'h2',
    label: 'H',
    title: 'Heading (Ctrl+H)',
    shortcut: 'h',
    before: '## ',
    after: '',
    style: { fontWeight: 800, fontSize: 14 },
  },
  { key: 'sep1', sep: true },
  {
    key: 'ul',
    label: '•',
    title: 'Bullet list',
    before: '- ',
    after: '',
    style: { fontSize: 18, lineHeight: '14px' },
  },
  {
    key: 'ol',
    label: '1.',
    title: 'Numbered list',
    before: '1. ',
    after: '',
    style: { fontSize: 12, fontWeight: 700 },
  },
  { key: 'sep2', sep: true },
  {
    key: 'code',
    label: '</>',
    title: 'Inline code',
    before: '`',
    after: '`',
    style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 700 },
  },
  {
    key: 'codeblock',
    label: '{ }',
    title: 'Code block',
    before: '```\n',
    after: '\n```',
    style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 700 },
  },
  {
    key: 'link',
    label: 'Lk',
    title: 'Link (Ctrl+K)',
    shortcut: 'k',
    before: '[',
    after: '](url)',
    style: { fontSize: 11, fontWeight: 700, textDecoration: 'underline' },
  },
  {
    key: 'quote',
    label: '❝',
    title: 'Blockquote',
    before: '> ',
    after: '',
    style: { fontSize: 15, lineHeight: '14px' },
  },
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

/* ── Word count helper (plain text / markdown) ──────────────────────── */
export function wordCount(text) {
  if (!text?.trim()) return 0
  return text.trim().split(/\s+/).length
}

/**
 * Word count helper for HTML content.
 * Creates a temporary element, extracts textContent, then counts words.
 */
export function countWordsFromHtml(html) {
  if (!html?.trim()) return 0
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  doc.body?.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  const walker = document.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT)
  const textParts = []
  let node = walker.nextNode()
  while (node) {
    const value = node.textContent?.trim()
    if (value) textParts.push(value)
    node = walker.nextNode()
  }
  const text = textParts.join(' ')
  if (!text.trim()) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

/* ── Re-export JSX components from notesComponents.jsx ─────────────── */
export { MarkdownPreview, NoteContentRenderer } from './notesComponents.jsx'
