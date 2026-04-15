import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config.js'
import { authHeaders } from '../shared/pageUtils.js'

export default function NoteVersionDiff({
  noteId,
  versionId,
  against = 'current',
  onClose,
  footer,
}) {
  const [mode, setMode] = useState('inline')
  const key = `${noteId}|${versionId}|${against}`
  const [state, setState] = useState({ key, loading: true, data: null, error: null })

  useEffect(() => {
    let cancelled = false
    fetch(
      `${API}/api/notes/${noteId}/versions/${versionId}/diff?against=${encodeURIComponent(against)}`,
      {
        credentials: 'include',
        headers: authHeaders(),
      },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`diff ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!cancelled) setState({ key, loading: false, data: d, error: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ key, loading: false, data: null, error: e.message })
      })
    return () => {
      cancelled = true
    }
  }, [noteId, versionId, against, key])

  const loading = state.key !== key || state.loading
  const data = state.key === key ? state.data : null
  const error = state.key === key ? state.error : null

  return createPortal(
    <div style={backdropStyle} onClick={onClose} data-testid="note-version-diff">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <strong>Diff</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setMode('inline')}
              style={tabStyle(mode === 'inline')}
            >
              Inline
            </button>
            <button
              type="button"
              onClick={() => setMode('sidebyside')}
              style={tabStyle(mode === 'sidebyside')}
            >
              Side by side
            </button>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={closeStyle}>
            x
          </button>
        </header>

        {loading && (
          <section style={{ padding: 24, color: 'var(--sh-slate-600)' }}>Loading diff...</section>
        )}
        {error && (
          <section style={{ padding: 24, color: 'var(--sh-danger-text)' }}>
            Failed to load diff: {error}
          </section>
        )}
        {data && (
          <>
            <section style={{ padding: 12, color: 'var(--sh-slate-600)', fontSize: 13 }}>
              <span style={{ color: 'var(--sh-success-text)' }}>+{data.summary.added} words</span>
              {'  '}
              <span style={{ color: 'var(--sh-danger-text)' }}>-{data.summary.removed} words</span>
            </section>
            <section style={{ padding: 16, overflow: 'auto', flex: 1 }}>
              {mode === 'inline' ? (
                <InlineDiff chunks={data.chunks} />
              ) : (
                <SideBySide chunks={data.chunks} />
              )}
            </section>
          </>
        )}
        {footer && <footer style={footerStyle}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

function InlineDiff({ chunks }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
      {chunks.map((c, i) => (
        <span key={i} style={chunkStyle(c.type)}>
          {c.text}
        </span>
      ))}
    </div>
  )
}

function SideBySide({ chunks }) {
  const left = chunks
    .filter((c) => c.type !== 'add')
    .map((c, i) => (
      <span key={`l-${i}`} style={chunkStyle(c.type === 'remove' ? 'remove' : 'equal')}>
        {c.text}
      </span>
    ))
  const right = chunks
    .filter((c) => c.type !== 'remove')
    .map((c, i) => (
      <span key={`r-${i}`} style={chunkStyle(c.type === 'add' ? 'add' : 'equal')}>
        {c.text}
      </span>
    ))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div
        style={{
          whiteSpace: 'pre-wrap',
          borderRight: '1px solid var(--sh-border)',
          paddingRight: 12,
        }}
      >
        {left}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{right}</div>
    </div>
  )
}

function chunkStyle(type) {
  if (type === 'add') return { background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' }
  if (type === 'remove')
    return {
      background: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger-text)',
      textDecoration: 'line-through',
    }
  return {}
}

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}
const modalStyle = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-slate-800)',
  width: 'min(1000px, 90vw)',
  height: 'min(80vh, 700px)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,.2)',
}
const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderBottom: '1px solid var(--sh-border)',
}
const footerStyle = {
  padding: 12,
  borderTop: '1px solid var(--sh-border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}
const closeStyle = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  cursor: 'pointer',
  color: 'var(--sh-slate-600)',
}
const tabStyle = (active) => ({
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: active ? 'var(--sh-soft)' : 'transparent',
  cursor: 'pointer',
})
