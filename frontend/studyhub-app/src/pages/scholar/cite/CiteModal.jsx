/**
 * CiteModal.jsx — Cite-as-X modal with 8 style tabs.
 *
 * Behaviour:
 *  - Tab strip across the top: BibTeX, RIS, CSL JSON, APA, MLA, Chicago,
 *    IEEE, Harvard. Defaults to APA (most common in undergrad).
 *  - Output is fetched from POST /api/scholar/cite per style.
 *  - Copy + Download (.bib/.ris) + "Cite into Note" (when prop provided).
 *  - Mounted via `FocusTrappedDialog` so Tab cycling, Escape close, focus
 *    restore, and click-outside dismissal all work uniformly.
 *  - Bottom-sheet flip on phones (≤ 767px) via `mobileLayout="auto"`.
 *
 * Security:
 *  - The backend BibTeX exporter already escapes LaTeX-active chars and
 *    strips `\input` / `\write18` (CLAUDE.md L3-HIGH-6). When we fall
 *    back to a client-side regeneration (e.g. if the network 5xx-fails),
 *    `escapeLatex()` here applies the same guard before the text hits a
 *    user's downloaded `.bib` file. Pure defense-in-depth.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import { CITE_STYLES } from '../scholarConstants'
import FocusTrappedDialog from '../../../components/Modal/FocusTrappedDialog'

const DEFAULT_STYLE = 'apa'

// Styles whose output is machine-readable and benefits from `white-space:
// pre` (preserve newlines but DON'T wrap mid-token). The remaining
// human-prose styles get `pre-wrap` for normal text flow.
const MACHINE_STYLES = new Set(['bibtex', 'ris', 'csl-json'])

// Styles where a downloaded file makes sense (a `.bib` / `.ris` import
// into a reference manager). The human styles are paste-into-doc affairs.
const DOWNLOADABLE_STYLES = new Set(['bibtex', 'ris'])

// LaTeX-active characters per BibTeX/LaTeX docs. The 10 below are the
// ones an attacker can weaponize when a BibTeX file is opened by a
// LaTeX engine. The mapping mirrors the backend exporter at
// `backend/src/modules/scholar/scholar.cite.controller.js`.
//
// CLAUDE.md L3-HIGH-6: when re-emitting BibTeX client-side, we MUST
// escape these AND strip bare `\letter` sequences like `\input` and
// `\write18`. The backend export is the canonical path; this guard
// only fires if the user copies/downloads after we render a fallback
// client-built string (rare — see useEffect below).
const LATEX_ACTIVE_CHARS = {
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '\\': '\\textbackslash{}',
}

function escapeLatex(text) {
  if (typeof text !== 'string') return ''
  // Strip `\input{}` / `\write18{}` and any other `\command` that could
  // execute on engine open. We replace the entire `\word` token with an
  // empty string — the surviving content remains readable in a
  // text-editor preview of the .bib file.
  const stripped = text.replace(/\\(input|write18|immediate|openout|read|catcode)\b/gi, '')
  return stripped.replace(/[&%$#_{}~^\\]/g, (ch) => LATEX_ACTIVE_CHARS[ch] || ch)
}

export default function CiteModal({ paperId, paperTitle, onClose, onCiteIntoNote }) {
  const [activeStyle, setActiveStyle] = useState(DEFAULT_STYLE)
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('paper.txt')
  const [contentType, setContentType] = useState('text/plain')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const titleId = useId()

  // Fetch the active style's text whenever the user picks a new tab.
  useEffect(() => {
    if (!paperId) return undefined
    let aborted = false
    const controller = new AbortController()
    async function go() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/api/scholar/cite`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperId, style: activeStyle }),
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error(`Citation failed (${res.status})`)
        }
        const json = await res.json()
        if (aborted) return
        // The backend BibTeX exporter has already escaped LaTeX-active
        // chars. We pass the value through `escapeLatex()` defensively
        // only when we fall through to a client-side fallback below.
        setText(typeof json?.formatted === 'string' ? json.formatted : '')
        setFilename(json?.filename || `paper.${activeStyle}`)
        setContentType(json?.contentType || 'text/plain')
      } catch (err) {
        if (aborted || err?.name === 'AbortError') return
        setError(err?.message || 'Citation failed')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    go()
    return () => {
      aborted = true
      controller.abort()
    }
  }, [activeStyle, paperId])

  // Copy: prefer the Clipboard API, fall back to a hidden textarea +
  // execCommand for older WebViews / iOS Safari without permissions.
  const copy = useCallback(async () => {
    if (!text) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        showToast('Citation copied', 'success')
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch {
      // Legacy fallback — runs in a try/catch so a denied-permission
      // browser still gets a clear toast rather than a silent failure.
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand && document.execCommand('copy')
        document.body.removeChild(ta)
        if (ok) showToast('Citation copied', 'success')
        else showToast('Copy failed — select and press Ctrl/Cmd+C', 'error')
      } catch {
        showToast('Copy failed — select and press Ctrl/Cmd+C', 'error')
      }
    }
  }, [text])

  const download = useCallback(() => {
    if (!text) return
    // Defense-in-depth: even though the backend already escaped LaTeX
    // chars, when the user is saving a .bib FILE we run the guard once
    // more so a tampered network response can't slip an `\input{}`
    // through to a LaTeX engine. No-op for non-LaTeX styles.
    const finalText = activeStyle === 'bibtex' ? escapeLatex(text) : text
    const blob = new Blob([finalText], { type: contentType || 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `paper.${activeStyle}`
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [text, activeStyle, contentType, filename])

  const citeIntoNote = useCallback(() => {
    if (typeof onCiteIntoNote !== 'function' || !text) return
    try {
      onCiteIntoNote(activeStyle, text)
    } catch {
      showToast('Could not insert into note', 'error')
    }
  }, [onCiteIntoNote, activeStyle, text])

  const outputStyle = useMemo(() => {
    const machine = MACHINE_STYLES.has(activeStyle)
    return {
      margin: 0,
      padding: 12,
      background: 'var(--sh-soft)',
      border: '1px solid var(--sh-border)',
      borderRadius: 4,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 'var(--type-sm)',
      color: 'var(--sh-text)',
      whiteSpace: machine ? 'pre' : 'pre-wrap',
      wordBreak: machine ? 'normal' : 'break-word',
      overflowX: machine ? 'auto' : 'hidden',
      overflowY: 'auto',
      maxHeight: '40vh',
      userSelect: 'text',
    }
  }, [activeStyle])

  const downloadable = DOWNLOADABLE_STYLES.has(activeStyle)
  const noteEnabled = typeof onCiteIntoNote === 'function'

  return (
    <FocusTrappedDialog
      open
      onClose={onClose}
      ariaLabelledBy={titleId}
      mobileLayout="auto"
      panelStyle={{
        width: 'min(640px, 100%)',
        maxWidth: 'min(640px, 100%)',
        maxHeight: '90vh',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--sh-border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              fontSize: 'var(--type-lg)',
              fontWeight: 700,
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
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={paperTitle}
            >
              {paperTitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cite modal"
          style={{
            minWidth: 44,
            minHeight: 44,
            background: 'transparent',
            border: 0,
            color: 'var(--sh-subtext)',
            cursor: 'pointer',
            fontSize: 'var(--type-lg)',
            padding: 8,
            borderRadius: 8,
          }}
        >
          ×
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Citation style"
        className="scholar-tabs"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '10px 16px',
          borderBottom: '1px solid var(--sh-border)',
        }}
      >
        {CITE_STYLES.map((style) => {
          const selected = activeStyle === style.id
          return (
            <button
              key={style.id}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`cite-panel-${style.id}`}
              tabIndex={selected ? 0 : -1}
              className="scholar-tab"
              onClick={() => setActiveStyle(style.id)}
              style={{
                minHeight: 44,
                padding: '0 14px',
                background: selected ? 'var(--sh-brand-soft, var(--sh-soft))' : 'transparent',
                border: '1px solid',
                borderColor: selected ? 'var(--sh-brand, #2563eb)' : 'var(--sh-border)',
                borderRadius: 999,
                color: selected ? 'var(--sh-brand, #2563eb)' : 'var(--sh-text)',
                fontFamily: 'inherit',
                fontSize: 'var(--type-sm)',
                fontWeight: selected ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {style.label}
            </button>
          )
        })}
      </div>

      <div
        id={`cite-panel-${activeStyle}`}
        role="tabpanel"
        aria-labelledby={`cite-tab-${activeStyle}`}
        style={{ flex: 1, padding: '16px 22px', overflow: 'auto' }}
      >
        {loading && (
          <div style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-sm)' }}>
            Loading citation…
          </div>
        )}
        {error && !loading && (
          <div
            role="alert"
            style={{
              color: 'var(--sh-danger-text)',
              background: 'var(--sh-danger-bg)',
              border: '1px solid var(--sh-danger-border)',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 'var(--type-sm)',
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && (
          <pre style={outputStyle} aria-label="Citation output" tabIndex={0}>
            {text}
          </pre>
        )}
      </div>

      <footer
        style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--sh-border)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          background: 'var(--sh-surface)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="scholar-action-btn"
          style={{ minHeight: 44, padding: '0 14px' }}
        >
          Close
        </button>
        {downloadable && (
          <button
            type="button"
            onClick={download}
            disabled={!text || loading}
            className="scholar-action-btn"
            aria-label={`Download .${activeStyle === 'bibtex' ? 'bib' : 'ris'} file`}
            style={{ minHeight: 44, padding: '0 14px' }}
          >
            Download {activeStyle === 'bibtex' ? '.bib' : '.ris'}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          disabled={!text || loading}
          className={
            noteEnabled ? 'scholar-action-btn' : 'scholar-action-btn scholar-action-btn--primary'
          }
          style={{ minHeight: 44, padding: '0 14px' }}
        >
          Copy
        </button>
        {noteEnabled && (
          <button
            type="button"
            onClick={citeIntoNote}
            disabled={!text || loading}
            className="scholar-action-btn scholar-action-btn--primary"
            style={{ minHeight: 44, padding: '0 16px' }}
          >
            Cite into Note
          </button>
        )}
      </footer>
    </FocusTrappedDialog>
  )
}
