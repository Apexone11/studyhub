/* ═══════════════════════════════════════════════════════════════════════════
 * uploadSheetComponents.jsx — React components extracted from
 * uploadSheetConstants to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function MiniPreview({ md }) {
  if (!md) return <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontStyle: 'italic' }}>Start typing to preview…</div>
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-soft)',
        padding: 14,
        color: 'var(--sh-text)',
        fontSize: 13,
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
      }}
    >
      {md}
    </div>
  )
}
