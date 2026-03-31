/* ═══════════════════════════════════════════════════════════════════════════
 * notesComponents.jsx — React components extracted from notesConstants
 * to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/* ── Safe markdown renderer ──────────────────────────────────────────── */
export function MarkdownPreview({ content }) {
  const html = useMemo(() => {
    if (!content?.trim()) return ''
    const raw = marked.parse(content)
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [content])

  if (!html) {
    return (
      <div style={{ color: 'var(--sh-muted, #94a3b8)', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
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
