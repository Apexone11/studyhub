/**
 * ScholarPaperPage.jsx — Paper reader at `/scholar/paper/:id`.
 *
 * Per Figma §23.4:
 *  - Sticky header (back, title, Save, Annotate, Cite, Generate sheet,
 *    Ask AI, Open original)
 *  - Two-column body: left = viewer, right = sidecar tabs (Info / Cited
 *    by / References / Notes / Discuss)
 *  - "View as text" toggle always available (founder §24.8 #1)
 *  - PDF.js iframe is sandboxed `allow-scripts allow-popups allow-forms`
 *    (NEVER `allow-same-origin` per A14)
 *  - Skip links (L4-MED-5)
 *
 * v1 implementation note: full PDF.js bundle integration is deferred to
 * the dedicated reader spike (per §18.6 — pdfjs-dist@4.x is the one
 * heavy dep, lazy-loaded via React.lazy on /scholar/paper/:id only).
 * For now the "PDF" surface shows the abstract + a link to the OA-PDF
 * (signed URL from /api/scholar/paper/:id/pdf when available, link out
 * otherwise). Toggle "View as PDF" lazy-loads the iframe surface when
 * the founder approves the dep.
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { usePageTitle } from '../../lib/usePageTitle'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { authHeaders } from '../shared/pageUtils'
import { isValidPaperId } from './scholarConstants'
import CiteModal from './cite/CiteModal'
import DiscussionThread from './discussion/DiscussionThread'
import './ScholarPage.css'

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'citedby', label: 'Cited by' },
  { id: 'references', label: 'References' },
  { id: 'notes', label: 'Notes' },
  { id: 'discuss', label: 'Discuss' },
]

function PaperHeaderActions({ paper, onSave, onCite, onAskAi, onGenerateSheet }) {
  return (
    <div className="scholar-reader__actions">
      <button
        type="button"
        className="scholar-action-btn"
        onClick={onSave}
        aria-label="Save paper to a shelf"
      >
        Save
      </button>
      <button type="button" className="scholar-action-btn" onClick={onCite} aria-label="Cite paper">
        Cite
      </button>
      <button
        type="button"
        className="scholar-action-btn scholar-action-btn--primary"
        onClick={onGenerateSheet}
        aria-label="Generate study sheet from paper"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" />
        </svg>
        Generate sheet
      </button>
      <button
        type="button"
        className="scholar-action-btn"
        onClick={onAskAi}
        aria-label="Ask Hub AI about this paper"
      >
        Ask AI
      </button>
      {paper?.pdfExternalUrl && (
        <a
          href={paper.pdfExternalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="scholar-action-btn"
          aria-label="Open original on publisher site"
        >
          Open original
        </a>
      )}
    </div>
  )
}

function InfoTab({ paper }) {
  if (!paper) return null
  const year = paper.publishedAt ? new Date(paper.publishedAt).getUTCFullYear() : '—'
  return (
    <dl style={{ display: 'grid', gap: 8, fontSize: 'var(--type-sm)', margin: 0 }}>
      <div>
        <dt style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>Authors</dt>
        <dd style={{ margin: 0, color: 'var(--sh-text)' }}>
          {(paper.authors || []).map((a) => a.name).join(', ') || 'Unknown'}
        </dd>
      </div>
      <div>
        <dt style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>Venue</dt>
        <dd style={{ margin: 0, color: 'var(--sh-text)' }}>{paper.venue || '—'}</dd>
      </div>
      <div>
        <dt style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>Year</dt>
        <dd style={{ margin: 0, color: 'var(--sh-text)' }}>{year}</dd>
      </div>
      <div>
        <dt style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>DOI</dt>
        <dd style={{ margin: 0, color: 'var(--sh-text)', wordBreak: 'break-all' }}>
          {paper.doi ? (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--sh-brand)' }}
            >
              {paper.doi}
            </a>
          ) : (
            '—'
          )}
        </dd>
      </div>
      <div>
        <dt style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>License</dt>
        <dd style={{ margin: 0, color: 'var(--sh-text)' }}>{paper.license || '—'}</dd>
      </div>
      <div>
        <dt style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>Citations</dt>
        <dd style={{ margin: 0, color: 'var(--sh-text)' }}>{paper.citationCount ?? 0}</dd>
      </div>
    </dl>
  )
}

export default function ScholarPaperPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const decodedId = useMemo(() => {
    try {
      return decodeURIComponent(id || '')
    } catch {
      return ''
    }
  }, [id])
  const validId = isValidPaperId(decodedId) ? decodedId : null

  usePageTitle('Scholar paper')
  const [paper, setPaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('text') // 'text' | 'pdf' (PDF.js deferred)
  const [activeTab, setActiveTab] = useState('info')
  const [citeOpen, setCiteOpen] = useState(false)

  useEffect(() => {
    if (!validId) {
      setError('Invalid paper id')
      setLoading(false)
      return undefined
    }
    let aborted = false
    setLoading(true)
    setError(null)
    fetch(`${API}/api/scholar/paper/${encodeURIComponent(validId)}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load paper (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (!aborted) setPaper(json.paper || null)
      })
      .catch((err) => {
        if (!aborted) setError(err.message || 'Could not load paper')
      })
      .finally(() => {
        if (!aborted) setLoading(false)
      })
    return () => {
      aborted = true
    }
  }, [validId])

  const handleSave = useCallback(async () => {
    if (!validId) return
    try {
      const res = await fetch(`${API}/api/scholar/save`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ paperId: validId }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      showToast('Saved to your shelf')
    } catch (err) {
      showToast(err.message || 'Could not save')
    }
  }, [validId])

  const handleAskAi = useCallback(() => {
    if (!validId) return
    navigate(`/ai?paperId=${encodeURIComponent(validId)}`)
  }, [navigate, validId])

  const handleGenerateSheet = useCallback(async () => {
    if (!validId) return
    try {
      const res = await fetch(`${API}/api/scholar/ai/generate-sheet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ paperId: validId }),
      })
      if (!res.ok) throw new Error(`Sheet prep failed (${res.status})`)
      const json = await res.json()
      // The backend returns a context blob + suggested prompt; we hand off
      // to /ai with a starter prompt so the existing sheet flow drives the
      // actual generation. Quota cost (5 messages) is enforced when /ai
      // posts the prompt.
      const prompt = json.suggestedPrompt || `Generate a study sheet for paperId ${validId}`
      navigate(`/ai?paperId=${encodeURIComponent(validId)}&prompt=${encodeURIComponent(prompt)}`)
    } catch (err) {
      showToast(err.message || 'Could not start sheet generation')
    }
  }, [navigate, validId])

  if (!validId) {
    return (
      <div className="scholar-page">
        <Navbar />
        <main className="scholar-shell" style={{ paddingTop: 64 }}>
          <h1 style={{ fontFamily: 'var(--font-paper)' }}>Paper not found</h1>
          <p style={{ color: 'var(--sh-subtext)' }}>The paper id is malformed.</p>
          <Link to="/scholar" style={{ color: 'var(--sh-brand)' }}>
            ← Back to Scholar
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="scholar-page">
      <Navbar />
      <a href="#scholar-paper-viewer" className="scholar-skip-link">
        Skip to paper viewer
      </a>
      <a href="#scholar-paper-sidecar" className="scholar-skip-link">
        Skip to sidecar
      </a>

      <header className="scholar-reader__sticky-head">
        <button
          type="button"
          className="scholar-action-btn"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          ←
        </button>
        <span className="scholar-reader__title" title={paper?.title || 'Loading…'}>
          {paper?.title || 'Loading…'}
        </span>
        <PaperHeaderActions
          paper={paper}
          onSave={handleSave}
          onCite={() => setCiteOpen(true)}
          onAskAi={handleAskAi}
          onGenerateSheet={handleGenerateSheet}
        />
      </header>

      <main className="scholar-shell">
        <div className="scholar-reader">
          <section
            id="scholar-paper-viewer"
            className="scholar-reader__viewer"
            aria-label="Paper viewer"
          >
            <div className="scholar-reader__viewer-controls">
              <div role="radiogroup" aria-label="Viewer mode" style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewMode === 'text'}
                  className="scholar-action-btn"
                  onClick={() => setViewMode('text')}
                  style={{
                    background: viewMode === 'text' ? 'var(--sh-brand-soft)' : undefined,
                    color: viewMode === 'text' ? 'var(--sh-brand)' : undefined,
                  }}
                >
                  View as text
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewMode === 'pdf'}
                  className="scholar-action-btn"
                  onClick={() => setViewMode('pdf')}
                  disabled={!paper?.pdfExternalUrl}
                  title={
                    paper?.pdfExternalUrl
                      ? 'Open the OA PDF inline'
                      : 'Paper has no open-access PDF'
                  }
                >
                  View as PDF
                </button>
              </div>
            </div>

            {loading && <div style={{ color: 'var(--sh-subtext)' }}>Loading paper…</div>}
            {error && (
              <div
                style={{
                  color: 'var(--sh-danger-text)',
                  background: 'var(--sh-danger-bg)',
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                {error}
              </div>
            )}

            {!loading && !error && paper && viewMode === 'text' && (
              <article className="scholar-reader__abstract">
                <h2
                  style={{
                    fontFamily: 'var(--font-paper)',
                    fontSize: 'var(--type-xl)',
                    margin: '0 0 12px',
                    color: 'var(--sh-heading)',
                  }}
                >
                  {paper.title}
                </h2>
                <div
                  style={{
                    color: 'var(--sh-subtext)',
                    fontSize: 'var(--type-sm)',
                    marginBottom: 16,
                  }}
                >
                  {(paper.authors || []).map((a) => a.name).join(', ')}
                </div>
                <p style={{ margin: 0 }}>
                  {paper.abstract || 'No abstract available for this paper.'}
                </p>
              </article>
            )}

            {!loading && !error && paper && viewMode === 'pdf' && paper.pdfExternalUrl && (
              <iframe
                title={`PDF viewer for ${paper.title}`}
                src={paper.pdfExternalUrl}
                /* allow-scripts only — never allow-same-origin (A14). */
                sandbox="allow-scripts allow-popups allow-forms"
                style={{
                  width: '100%',
                  minHeight: 600,
                  border: '1px solid var(--sh-border)',
                  borderRadius: 10,
                  background: 'var(--sh-surface)',
                }}
              />
            )}

            {!loading && !error && paper && !paper.pdfExternalUrl && viewMode === 'pdf' && (
              <div className="scholar-reader__paywall-card">
                <h3 style={{ fontFamily: 'var(--font-paper)', margin: '0 0 8px' }}>
                  This paper is paywalled
                </h3>
                <p
                  style={{
                    color: 'var(--sh-subtext)',
                    margin: '0 0 24px',
                    fontSize: 'var(--type-sm)',
                  }}
                >
                  We couldn't find a free, openly-licensed version. Use the publisher link below to
                  read it on their site.
                </p>
                {paper.doi && (
                  <a
                    href={`https://doi.org/${paper.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="scholar-action-btn scholar-action-btn--primary"
                  >
                    Open at publisher
                  </a>
                )}
              </div>
            )}
          </section>

          <aside
            id="scholar-paper-sidecar"
            className="scholar-reader__sidecar"
            aria-label="Paper sidecar"
          >
            <div role="tablist" className="scholar-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  className="scholar-tab"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'info' && <InfoTab paper={paper} />}
            {activeTab === 'citedby' && (
              <div style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-sm)' }}>
                Cited-by data loads from /api/scholar/paper/:id/citations.
              </div>
            )}
            {activeTab === 'references' && (
              <div style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-sm)' }}>
                Reference list loads from /api/scholar/paper/:id/references.
              </div>
            )}
            {activeTab === 'notes' && (
              <div style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-sm)' }}>
                Your annotations live here. Highlight text in the viewer to start one (mouse/touch).
                Keyboard users: this tab is the primary entry point — paste a quote and add a note
                below.
              </div>
            )}
            {activeTab === 'discuss' && validId && <DiscussionThread paperId={validId} />}
          </aside>
        </div>
      </main>

      {citeOpen && validId && (
        <CiteModal paperId={validId} paperTitle={paper?.title} onClose={() => setCiteOpen(false)} />
      )}
    </div>
  )
}
