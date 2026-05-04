/**
 * CiteModal.jsx — Cite-as-X modal with 8 style tabs.
 *
 * - createPortal so the modal is unaffected by ancestor `transform`.
 * - Calls POST /api/scholar/cite with the chosen style.
 * - Exposes a Copy button + a Download button.
 *
 * a11y:
 *  - role=dialog + aria-modal + aria-label
 *  - Esc closes
 *  - Focus moves to the first tab on open
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import { CITE_STYLES } from '../scholarConstants'

export default function CiteModal({ paperId, paperTitle, onClose }) {
  const [activeStyle, setActiveStyle] = useState('bibtex')
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('paper.bib')
  const [contentType, setContentType] = useState('text/plain')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const firstTabRef = useRef(null)

  // Esc to close + focus initial tab on mount
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    firstTabRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch the active style's text whenever the user picks a new tab
  useEffect(() => {
    let aborted = false
    async function go() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/api/scholar/cite`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperId, style: activeStyle }),
        })
        if (!res.ok) {
          throw new Error(`Citation failed (${res.status})`)
        }
        const json = await res.json()
        if (aborted) return
        setText(json.formatted || '')
        setFilename(json.filename || `paper.${activeStyle}`)
        setContentType(json.contentType || 'text/plain')
      } catch (err) {
        if (!aborted) {
          setError(err.message || 'Citation failed')
        }
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    if (paperId) go()
    return () => {
      aborted = true
    }
  }, [activeStyle, paperId])

  function copy() {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard
      .writeText(text)
      .then(() => showToast('Citation copied to clipboard'))
      .catch(() => showToast('Copy failed'))
  }

  function download() {
    if (!text) return
    const blob = new Blob([text], { type: contentType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
  }
  const dialogStyle = {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: '14px',
    boxShadow: 'var(--shadow-lg)',
    width: 'min(640px, 100%)',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  return createPortal(
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cite ${paperTitle || 'paper'}`}
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--sh-border)' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-paper)',
              fontSize: 'var(--type-lg)',
              color: 'var(--sh-heading)',
            }}
          >
            Cite this paper
          </h2>
          {paperTitle && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 'var(--type-sm)',
                color: 'var(--sh-subtext)',
              }}
            >
              {paperTitle}
            </p>
          )}
        </div>

        <div role="tablist" className="scholar-tabs" style={{ padding: '0 24px' }}>
          {CITE_STYLES.map((style, i) => (
            <button
              key={style.id}
              ref={i === 0 ? firstTabRef : null}
              role="tab"
              aria-selected={activeStyle === style.id}
              className="scholar-tab"
              type="button"
              onClick={() => setActiveStyle(style.id)}
            >
              {style.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: '16px 24px', overflow: 'auto' }}>
          {loading && <div style={{ color: 'var(--sh-subtext)' }}>Loading…</div>}
          {error && (
            <div
              style={{
                color: 'var(--sh-danger-text)',
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              {error}
            </div>
          )}
          {!loading && !error && (
            <pre
              style={{
                margin: 0,
                padding: '14px',
                background: 'var(--sh-soft)',
                border: '1px solid var(--sh-border)',
                borderRadius: '8px',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 'var(--type-sm)',
                color: 'var(--sh-text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '40vh',
                overflow: 'auto',
              }}
            >
              {text}
            </pre>
          )}
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--sh-border)',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="scholar-action-btn"
            onClick={onClose}
            aria-label="Close cite modal"
          >
            Close
          </button>
          <button
            type="button"
            className="scholar-action-btn"
            onClick={download}
            disabled={!text || loading}
          >
            Download
          </button>
          <button
            type="button"
            className="scholar-action-btn scholar-action-btn--primary"
            onClick={copy}
            disabled={!text || loading}
          >
            Copy
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
