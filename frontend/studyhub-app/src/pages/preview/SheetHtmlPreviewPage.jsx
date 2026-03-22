import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell } from '../../lib/ui'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function panelStyle() {
  return {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    padding: 16,
  }
}

export default function SheetHtmlPreviewPage() {
  const navigate = useNavigate()
  const { clearSession } = useSession()
  const { id } = useParams()
  const sheetId = Number.parseInt(id, 10)
  const [state, setState] = useState({ loading: true, error: '', preview: null })
  const [isFullscreen, setIsFullscreen] = useState(false)

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

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

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
      setState({ loading: false, error: error.message || 'Could not load HTML preview.', preview: null })
    }
  }, [clearSession, navigate, sheetId])

  useEffect(() => {
    setState({ loading: true, error: '', preview: null })
    void loadPreview()
  }, [loadPreview])

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Study Sheets', to: '/sheets' }, { label: 'HTML Preview', to: null }]} hideTabs hideSearch />
      <div style={pageShell('reading', 22, 40)}>
        <main id="main-content" style={{ display: 'grid', gap: 14 }}>
          <section style={panelStyle()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Sandbox HTML Preview</h1>
                <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                  Full-page draft testing via short-lived preview session on an isolated surface.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link to={`/sheets/${sheetId}/edit`} style={buttonStyle()}>
                  Back to editor
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
            <section style={{ ...panelStyle(), background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' }}>
              {state.error}
            </section>
          ) : null}

          {state.loading ? (
            <section style={panelStyle()}>
              <div style={{ fontSize: 13, color: '#64748b' }}>Loading preview…</div>
            </section>
          ) : null}

          {state.preview ? (
            <>
              <section style={panelStyle()}>
                <div style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span><strong>Title:</strong> {state.preview.title || 'Untitled'}</span>
                  <span><strong>Status:</strong> {state.preview.status}</span>
                  <span><strong>Updated:</strong> {new Date(state.preview.updatedAt).toLocaleString()}</span>
                </div>
              </section>

              {state.preview?.sanitized ? (
                <section style={{ ...panelStyle(), borderColor: '#fde68a', background: '#fffbeb' }}>
                  <div style={{ fontSize: 13, color: '#92400e', fontWeight: 800 }}>
                    Sanitized preview
                  </div>
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 6, lineHeight: 1.6 }}>
                    We removed unsafe HTML (scripts/iframes/etc) to keep preview safe. Fix the findings in the editor for a clean scan.
                  </div>
                  {Array.isArray(state.preview.issues) && state.preview.issues.length ? (
                    <ul style={{ marginTop: 10, paddingLeft: 18, color: '#92400e', fontSize: 12, lineHeight: 1.6 }}>
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
                        background: '#0b1220',
                        padding: 12,
                        display: 'grid',
                        gridTemplateRows: '48px 1fr',
                        gap: 10,
                      }
                    : { ...panelStyle(), padding: 0, overflow: 'hidden' }
                }
              >
                {isFullscreen ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
                    <div style={{ fontWeight: 800 }}>HTML Preview</div>
                    <button type="button" onClick={() => setIsFullscreen(false)} style={{ ...buttonStyle(), borderColor: '#334155' }}>
                      Exit fullscreen
                    </button>
                  </div>
                ) : null}

                <iframe
                  title={`html-sheet-preview-${sheetId}`}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  src={state.preview.previewUrl || ''}
                  style={{
                    width: '100%',
                    height: isFullscreen ? '100%' : 'calc(100vh - 260px)',
                    minHeight: isFullscreen ? 'unset' : 700,
                    border: 'none',
                    background: '#fff',
                    borderRadius: isFullscreen ? 12 : 0,
                  }}
                />
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
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
  }
}
