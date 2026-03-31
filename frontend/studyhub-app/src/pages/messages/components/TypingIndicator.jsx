/* ─────────────────────────────────────────────────────────────
 * TypingIndicator.jsx
 * Shows a typing indicator with usernames
 * ───────────────────────────────────────────────────────────── */

export function TypingIndicator({ usernames }) {
  const text = usernames.length === 1
    ? `${usernames[0]} is typing`
    : usernames.length === 2
      ? `${usernames[0]} and ${usernames[1]} are typing`
      : `${usernames[0]} and ${usernames.length - 1} others are typing`

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 12,
      alignItems: 'flex-end',
    }}>
      <div style={{
        padding: '8px 12px',
        background: 'var(--sh-soft)',
        color: 'var(--sh-text)',
        borderRadius: 'var(--radius-control)',
        fontSize: 13,
      }}>
        <span style={{ opacity: 0.7 }}>{text}</span>
        <span style={{ marginLeft: 4 }}>...</span>
      </div>
    </div>
  )
}
