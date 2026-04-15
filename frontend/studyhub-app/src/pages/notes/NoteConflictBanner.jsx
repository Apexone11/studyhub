export default function NoteConflictBanner({ onKeepMine, onTakeTheirs, onCompare }) {
  return (
    <div
      role="alert"
      data-testid="note-conflict-banner"
      style={{
        padding: 12,
        marginBottom: 12,
        borderRadius: 10,
        background: 'var(--sh-danger-bg)',
        color: 'var(--sh-danger-text)',
        border: '1px solid var(--sh-danger-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <strong>Newer version on server.</strong>
      <span style={{ flex: 1 }}>Another device or tab updated this note.</span>
      <button type="button" onClick={onKeepMine} style={primaryBtn}>
        Keep mine
      </button>
      <button type="button" onClick={onTakeTheirs} style={secondaryBtn}>
        Use theirs
      </button>
      <button type="button" onClick={onCompare} style={secondaryBtn}>
        Compare side-by-side
      </button>
    </div>
  )
}

const primaryBtn = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--sh-primary)',
  color: '#ffffff',
}
const secondaryBtn = {
  padding: '6px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  background: 'var(--sh-surface)',
  color: 'var(--sh-slate-800)',
  border: '1px solid var(--sh-border)',
}
