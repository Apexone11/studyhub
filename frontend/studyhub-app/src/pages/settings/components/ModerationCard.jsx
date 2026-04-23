/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationCard.jsx — Reusable card container
 * ═══════════════════════════════════════════════════════════════════════════ */

export function Card({ children, style }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 14,
        border: '1px solid var(--sh-border)',
        padding: '20px 22px',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
