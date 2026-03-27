/* ═══════════════════════════════════════════════════════════════════════════
 * searchModalComponents.jsx — React components extracted from
 * searchModalConstants to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function Highlight({ text, query }) {
  if (!query || query.length < 2 || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#fef08a', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  )
}
