/* ═══════════════════════════════════════════════════════════════════════════
 * notesComponents.jsx — React components extracted from notesConstants
 * to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Detect whether content is likely markdown (vs HTML).
 * If the string contains no `<` characters at all, or starts with common
 * markdown syntax (headings, lists, blockquotes), treat it as markdown.
 */
function isLikelyMarkdown(content) {
  if (!content) return false
  const trimmed = content.trim()
  // No HTML tags at all -- plain text / markdown
  if (!trimmed.includes('<')) return true
  // Starts with markdown heading, list, blockquote, or horizontal rule
  if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|---|\*\*\*|___)/.test(trimmed)) return true
  return false
}

/* ── Content renderer that handles both markdown and HTML ────────────── */
export function NoteContentRenderer({ content }) {
  const html = useMemo(() => {
    if (!content?.trim()) return ''
    if (isLikelyMarkdown(content)) {
      const raw = marked.parse(content)
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
    }
    // Already HTML -- sanitize and render directly
    return DOMPurify.sanitize(content, { USE_PROFILES: { html: true } })
  }, [content])

  if (!html) {
    return (
      <div style={{ color: 'var(--sh-muted)', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
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

/* ── Backward-compatible alias ───────────────────────────────────────── */
export const MarkdownPreview = NoteContentRenderer
