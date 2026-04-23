export default function SocketWarning({ socketError }) {
  if (!socketError) return null

  return (
    <div
      role="alert"
      style={{
        padding: '6px 12px',
        background: 'var(--sh-info-bg)',
        borderBottom: '1px solid var(--sh-info-border)',
        color: 'var(--sh-info-text)',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--sh-warning-text)',
          flexShrink: 0,
        }}
      />
      Live updates paused
    </div>
  )
}
