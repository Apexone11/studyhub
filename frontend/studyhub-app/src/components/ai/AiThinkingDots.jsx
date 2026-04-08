/**
 * AiThinkingDots.jsx -- Animated "thinking" indicator for Hub AI.
 *
 * Displays three pulsing dots during the network round-trip gap
 * between the user sending a message and the first SSE delta arriving.
 * CSS-only animation -- no external dependencies.
 */

const dotStyle = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--sh-brand, #6366f1)',
  opacity: 0.4,
  animation: 'aiThinkPulse 1.4s ease-in-out infinite',
}

const containerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '12px 16px',
}

const labelStyle = {
  fontSize: 13,
  color: 'var(--sh-slate-500, #64748b)',
  marginRight: 6,
}

export default function AiThinkingDots({ compact = false }) {
  return (
    <>
      <style>{`
        @keyframes aiThinkPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div style={containerStyle}>
        {!compact && <span style={labelStyle}>Thinking</span>}
        <span style={{ ...dotStyle, animationDelay: '0s' }} />
        <span style={{ ...dotStyle, animationDelay: '0.2s' }} />
        <span style={{ ...dotStyle, animationDelay: '0.4s' }} />
      </div>
    </>
  )
}
