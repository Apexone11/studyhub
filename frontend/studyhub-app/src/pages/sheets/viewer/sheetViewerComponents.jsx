/* ═══════════════════════════════════════════════════════════════════════════
 * sheetViewerComponents.jsx — JSX-rendering helpers extracted from
 * sheetViewerConstants to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function errorBanner(message) {
  if (!message) return null
  return (
    <div
      style={{
        background: 'var(--sh-danger-bg)',
        color: 'var(--sh-danger)',
        border: '1px solid var(--sh-danger-border)',
        borderRadius: 14,
        padding: '12px 14px',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  )
}
