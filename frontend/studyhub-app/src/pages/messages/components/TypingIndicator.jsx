/* ─────────────────────────────────────────────────────────────
 * TypingIndicator.jsx
 * Shows a typing indicator with usernames. Uses a 150ms fade-in so the
 * pill doesn't pop in / out abruptly when typing pings stop and start
 * (Slack / Discord pattern). The fade is gated behind
 * prefers-reduced-motion so users who opt out get instant show/hide.
 * ───────────────────────────────────────────────────────────── */

const FADE_KEYFRAMES = `
  @keyframes sh-typing-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sh-typing-indicator { animation: none !important; }
  }
`

export function TypingIndicator({ usernames }) {
  const text =
    usernames.length === 1
      ? `${usernames[0]} is typing`
      : usernames.length === 2
        ? `${usernames[0]} and ${usernames[1]} are typing`
        : `${usernames[0]} and ${usernames.length - 1} others are typing`

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: 12,
        alignItems: 'flex-end',
      }}
    >
      <style>{FADE_KEYFRAMES}</style>
      <div
        className="sh-typing-indicator"
        style={{
          padding: '8px 12px',
          background: 'var(--sh-soft)',
          color: 'var(--sh-text)',
          borderRadius: 'var(--radius-control)',
          fontSize: 13,
          animation: 'sh-typing-fade-in 150ms ease-out',
        }}
      >
        <span style={{ opacity: 0.7 }}>{text}</span>
        <span style={{ marginLeft: 4 }}>...</span>
      </div>
    </div>
  )
}
