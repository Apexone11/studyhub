/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationStatusPill.jsx — Status badge component
 * ═══════════════════════════════════════════════════════════════════════════ */

export function StatusPill({ status }) {
  const map = {
    pending: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', border: 'var(--sh-warning-border)' },
    confirmed: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
    dismissed: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
    reversed: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', border: 'var(--sh-success-border)' },
    approved: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', border: 'var(--sh-success-border)' },
    rejected: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  )
}
