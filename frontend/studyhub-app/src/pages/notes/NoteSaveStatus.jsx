import { useEffect, useState } from 'react'

const STATUS_META = {
  idle: { label: 'Up to date', dot: 'var(--sh-slate-300)' },
  dirty: { label: 'Unsaved changes', dot: 'var(--sh-warning)' },
  saving: { label: 'Saving', dot: 'var(--sh-warning)', pulse: true },
  saved: { label: 'Saved', dot: 'var(--sh-success)' },
  error: { label: 'Save failed - retry', dot: 'var(--sh-danger)' },
  offline: { label: 'Offline - saved locally', dot: 'var(--sh-slate-400)' },
  conflict: { label: 'Newer version on server', dot: 'var(--sh-danger)' },
}

export default function NoteSaveStatus({
  status,
  lastSavedAt,
  onRetry,
  onOpenConflict,
  onSaveNow,
}) {
  const meta = STATUS_META[status] ?? STATUS_META.idle
  const [revertedKey, setRevertedKey] = useState(null)
  const currentKey = status === 'saved' ? `${lastSavedAt ?? ''}` : null

  useEffect(() => {
    if (status !== 'saved') return undefined
    const key = `${lastSavedAt ?? ''}`
    const t = setTimeout(() => setRevertedKey(key), 3000)
    return () => clearTimeout(t)
  }, [status, lastSavedAt])

  const showIdleLabel = status === 'saved' && revertedKey === currentKey
  const displayLabel = showIdleLabel ? STATUS_META.idle.label : meta.label

  let tooltip = ''
  if (status === 'saved' && lastSavedAt) {
    tooltip = `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
  } else if (status === 'error') {
    tooltip = 'Click to retry'
  } else if (status === 'conflict') {
    tooltip = 'Tap to resolve'
  } else if (status === 'offline') {
    tooltip = 'Will sync when online'
  }

  const clickable = status === 'error' || status === 'conflict'
  const handleClick = () => {
    if (status === 'error' && onRetry) onRetry()
    else if (status === 'conflict' && onOpenConflict) onOpenConflict()
  }

  const showSaveNow =
    (status === 'dirty' || status === 'error' || status === 'offline') &&
    typeof onSaveNow === 'function'

  return (
    <div
      className="sh-note-save-status"
      data-testid="note-save-status"
      data-status={status}
      role={clickable ? 'button' : 'status'}
      aria-live="polite"
      title={tooltip}
      onClick={clickable ? handleClick : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'var(--sh-soft)',
        color: 'var(--sh-slate-700)',
        cursor: clickable ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: meta.dot,
          animation: meta.pulse ? 'sh-pulse 1s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ fontSize: 13 }}>{displayLabel}</span>
      {showSaveNow && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSaveNow()
          }}
          style={{
            marginLeft: 4,
            fontSize: 12,
            padding: '2px 8px',
            border: 'none',
            borderRadius: 6,
            background: 'var(--sh-primary)',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          Save now
        </button>
      )}
    </div>
  )
}
