/**
 * Tiny pill showing the user's personal study status for a sheet.
 * Rendered on sheet cards across search, feed, course, and profile surfaces.
 */

const STATUS_CONFIG = {
  'to-review': { label: 'To review', bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)' },
  studying: { label: 'Studying', bg: 'var(--sh-info-bg)', color: 'var(--sh-brand)' },
  done: { label: 'Done', bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' },
}

export default function StudyStatusChip({ status }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return null
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        padding: '2px 7px',
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
        lineHeight: '16px',
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  )
}
