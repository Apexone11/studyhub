/* ═══════════════════════════════════════════════════════════════════════════
 * AiStopButton.jsx — Streaming-active replacement for the Send button.
 *
 * When a Hub AI stream is in flight, the composer's Send button is replaced
 * with this Stop button. Click invokes `chat.stopStreaming()` and announces
 * "Streaming stopped" via the page-level aria-live region (L4-HIGH-2).
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function AiStopButton({ onStop, label = 'Stop' }) {
  return (
    <button
      type="button"
      onClick={onStop}
      aria-label="Stop generating response"
      style={{
        background: 'var(--sh-danger)',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        minWidth: 44,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
      {label}
    </button>
  )
}
