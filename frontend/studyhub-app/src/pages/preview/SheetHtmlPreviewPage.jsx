import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { pageShell } from '../../lib/ui'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function panelStyle() {
  return {
    background: 'var(--sh-surface)',
    borderRadius: 16,
    border: '1px solid var(--sh-border)',
    padding: 16,
  }
}

export default function SheetHtmlPreviewPage() {
  const { id } = useParams()
  const sheetId = Number.parseInt(id, 10)
  const [state, setState] = useState({ loading: true, error: '', preview: null })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [interactive, setInteractive] = useState(false)
  const [runtimeUrl, setRuntimeUrl] = useState('')
  const [runtimeLoading, setRuntimeLoading] = useState(false)

  // Escape key exits fullscreen. Only bound while fullscreen is active so
  // the handler does not fight with modals or dropdowns on the normal view.
  // Also locks body scroll while fullscreen is active so the background
  // does not scroll behind the overlay.
  useEffect(() => {
    if (!isFullscreen) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  const loadPreview = useCallback(async () => {
    if (!Number.isInteger(sheetId)) {
      setState({ loading: false, error: 'Invalid sheet id.', preview: null })
      return
    }

    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/html-preview`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})

      if (response.status === 403) {
        setState({
          loading: false,
          error: getApiErrorMessage(data, 'You do not have access to this HTML preview.'),
          preview: null,
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load HTML preview.'))
      }

      if (!data?.previewUrl || typeof data.previewUrl !== 'string') {
        throw new Error('Could not start isolated HTML preview session.')
      }

      setState({ loading: false, error: '', preview: data })
    } catch (error) {
      setState({
        loading: false,
        error: error.message || 'Could not load HTML preview.',
        preview: null,
      })
    }
  }, [sheetId])

  useEffect(() => {
    setState({ loading: true, error: '', preview: null })
    setInteractive(false)
    setRuntimeUrl('')
    void loadPreview()
  }, [loadPreview])

  const loadRuntime = useCallback(async () => {
    if (!Number.isInteger(sheetId) || runtimeUrl) return
    setRuntimeLoading(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/html-runtime`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (data?.runtimeUrl) setRuntimeUrl(data.runtimeUrl)
      else throw new Error(getApiErrorMessage(data, 'Could not load interactive preview.'))
    } catch {
      setInteractive(false)
    } finally {
      setRuntimeLoading(false)
    }
  }, [sheetId, runtimeUrl])

  const toggleInteractive = useCallback(() => {
    if (interactive) {
      setInteractive(false)
    } else {
      setInteractive(true)
      if (!runtimeUrl) loadRuntime()
    }
  }, [interactive, runtimeUrl, loadRuntime])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
      <Navbar
        crumbs={[
          { label: 'Study Sheets', to: '/sheets' },
          { label: 'HTML Preview', to: null },
        ]}
        hideTabs
        hideSearch
      />
      <div style={pageShell('reading', 22, 40)}>
        <main id="main-content" style={{ display: 'grid', gap: 14 }}>
          <section style={panelStyle()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h1 style={{ margin: 0, fontSize: 22, color: 'var(--sh-slate-900)' }}>
                  Sandbox HTML Preview
                </h1>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--sh-slate-500)' }}>
                  Full-page preview in a secure sandboxed session.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link to={`/sheets/${sheetId}/lab`} style={buttonStyle()}>
                  Back to SheetLab
                </Link>
                <Link to={`/sheets/${sheetId}`} style={buttonStyle()}>
                  Open sheet
                </Link>
                <button
                  type="button"
                  onClick={() => setIsFullscreen((v) => !v)}
                  style={buttonStyle()}
                >
                  {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                </button>
              </div>
            </div>
          </section>

          {state.error ? (
            <section
              style={{
                ...panelStyle(),
                background: 'var(--sh-danger-bg)',
                borderColor: 'var(--sh-danger-border)',
                color: 'var(--sh-danger)',
              }}
            >
              {state.error}
            </section>
          ) : null}

          {state.loading ? (
            <section style={panelStyle()}>
              <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Loading preview…</div>
            </section>
          ) : null}

          {state.preview ? (
            <>
              <section style={panelStyle()}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-subtext)',
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <strong>Title:</strong> {state.preview.title || 'Untitled'}
                  </span>
                  <span>
                    <strong>Status:</strong> {state.preview.status}
                  </span>
                  <span>
                    <strong>Updated:</strong> {new Date(state.preview.updatedAt).toLocaleString()}
                  </span>
                </div>
              </section>

              {state.preview?.canInteract ? (
                <section style={panelStyle()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div
                      style={{
                        display: 'flex',
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: '1px solid var(--sh-border)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setInteractive(false)}
                        style={toggleBtnStyle(!interactive)}
                      >
                        Safe Preview
                      </button>
                      <button
                        type="button"
                        onClick={toggleInteractive}
                        style={toggleBtnStyle(interactive)}
                      >
                        Interactive Preview
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--sh-muted)', lineHeight: 1.4 }}>
                      {interactive
                        ? 'Scripts enabled in a locked sandbox — no access to your account or network.'
                        : 'Scripts disabled for maximum security.'}
                    </span>
                  </div>
                </section>
              ) : null}

              {state.preview?.sanitized ? (
                <section
                  style={{
                    ...panelStyle(),
                    borderColor: 'var(--sh-warning-border)',
                    background: 'var(--sh-warning-bg)',
                  }}
                >
                  <div
                    style={{ fontSize: 13, color: 'var(--sh-warning-dark-text)', fontWeight: 800 }}
                  >
                    Safe preview mode
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sh-warning-dark-text)',
                      marginTop: 6,
                      lineHeight: 1.6,
                    }}
                  >
                    This preview has scripts and embeds disabled for safety. Review the scan
                    findings below if you want a clean report.
                  </div>
                  {Array.isArray(state.preview.issues) && state.preview.issues.length ? (
                    <ul
                      style={{
                        marginTop: 10,
                        paddingLeft: 18,
                        color: 'var(--sh-warning-dark-text)',
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      {state.preview.issues.slice(0, 8).map((issue, idx) => (
                        <li key={idx}>{issue?.message || String(issue)}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              <section
                style={
                  isFullscreen
                    ? {
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        background: 'var(--sh-slate-900)',
                        padding: 12,
                        display: 'grid',
                        gridTemplateRows: '48px 1fr',
                        gap: 10,
                      }
                    : { ...panelStyle(), padding: 0, overflow: 'hidden' }
                }
              >
                {isFullscreen ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      color: 'var(--sh-nav-text)',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>HTML Preview</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          fontSize: 11,
                          color: 'var(--sh-slate-400, #94a3b8)',
                          fontWeight: 600,
                        }}
                      >
                        Press{' '}
                        <kbd
                          style={{
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'var(--sh-slate-800, #1e293b)',
                            border: '1px solid var(--sh-slate-700, #334155)',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: 'var(--sh-slate-200, #e2e8f0)',
                          }}
                        >
                          Esc
                        </kbd>{' '}
                        to exit
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsFullscreen(false)}
                        aria-label="Exit fullscreen preview"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: '1px solid var(--sh-slate-600, #475569)',
                          background: 'var(--sh-slate-800, #1e293b)',
                          color: 'var(--sh-slate-100, #f1f5f9)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                        Exit fullscreen
                      </button>
                    </div>
                  </div>
                ) : null}

                {runtimeLoading && interactive ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      fontSize: 13,
                      color: 'var(--sh-muted)',
                    }}
                  >
                    Loading interactive preview…
                  </div>
                ) : (
                  <iframe
                    title={`html-sheet-preview-${sheetId}`}
                    // Two sandbox modes:
                    //
                    //   - Interactive runtime: the author's inline scripts
                    //     run inside an opaque-origin sandbox. We grant
                    //     allow-scripts + allow-forms ONLY. Withholding
                    //     allow-same-origin is the real security boundary
                    //     here — it prevents any author script from reading
                    //     the parent app's cookies/storage.
                    //
                    //   - Safe preview: scripts are stripped server-side,
                    //     so the iframe is rendering static, sanitized HTML.
                    //     We DO grant allow-same-origin in this branch
                    //     because the iframe src is on a different subdomain
                    //     (api.getstudyhub.org) from the parent
                    //     (www.getstudyhub.org), and Chrome blocks
                    //     cross-origin iframes that have a fully
                    //     restrictive (empty) sandbox attribute with the
                    //     "(blocked:origin)" placeholder you see in
                    //     screenshot 1. With no scripts allowed it cannot
                    //     do anything dangerous with same-origin access.
                    //
                    // Test enforcement of these flags lives in
                    // backend/test/interactive-preview.test.js.
                    sandbox={
                      interactive && runtimeUrl ? 'allow-scripts allow-forms' : 'allow-same-origin'
                    }
                    referrerPolicy="no-referrer"
                    src={interactive && runtimeUrl ? runtimeUrl : state.preview.previewUrl || ''}
                    style={{
                      width: '100%',
                      height: isFullscreen ? '100%' : 'calc(100vh - 260px)',
                      minHeight: isFullscreen ? 'unset' : 700,
                      border: 'none',
                      background: 'var(--sh-surface)',
                      borderRadius: isFullscreen ? 12 : 0,
                    }}
                  />
                )}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}

function buttonStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 11px',
    borderRadius: 8,
    border: '1px solid var(--sh-info-border, #dbeafe)',
    background: 'var(--sh-info-bg)',
    color: 'var(--sh-info-text, #1d4ed8)',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
  }
}

function toggleBtnStyle(active) {
  return {
    padding: '6px 14px',
    border: 'none',
    background: active ? 'var(--sh-brand)' : 'var(--sh-soft)',
    color: active ? 'var(--sh-nav-text)' : 'var(--sh-subtext)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  }
}
