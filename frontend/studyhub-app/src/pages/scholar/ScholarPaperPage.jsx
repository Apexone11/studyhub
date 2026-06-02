/**
 * ScholarPaperPage.jsx — Scholar paper detail (reading + action) page.
 *
 * Centerpiece of the Scholar redesign. Two-column desktop:
 *  - LEFT (max 720px, centered): paper header, AI tldr, reading body,
 *    tabs (Abstract / References / Citations / Similar / Discussion /
 *    Annotations).
 *  - RIGHT (sticky 320px sidebar): primary action stack (Save, Cite into
 *    Note, Generate study sheet, Open PDF) + Connected work mini-graph
 *    placeholder + Recently viewed strip.
 *
 * Reading-mode exception (the only place in StudyHub where SERIF body
 * text is allowed). Serif/Sans toggle persists in localStorage
 * `studyhub.scholar.readerFont` (default Serif).
 *
 * Mobile (<768px):
 *  - Single column, sticky-collapsing title bar appears on scroll.
 *  - Action stack collapses to a horizontal sticky button bar at the
 *    BOTTOM, above the safe-area inset.
 *  - Tabs become a horizontal swipeable strip.
 *  - Reading body uses 16px (not 18 — too cramped on phones), 100% width.
 *
 * Security:
 *  - PDF iframe sandbox = "allow-scripts allow-popups allow-forms"
 *    (NEVER `allow-same-origin` per CLAUDE.md A14).
 *  - All `target="_blank"` carry rel="noopener noreferrer" (A15).
 *  - paperId validated against PAPER_ID_REGEX before any fetch.
 *
 * AI integration: "Generate study sheet" is a quota-spending action and
 * goes through `useAiPermission()` before firing.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'
import useFetch, { cache as fetchCache, clearFetchCache } from '../../lib/useFetch'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { useAiPermission } from '../../lib/aiPermissionContext'
import { authHeaders } from '../shared/pageUtils'
import { isValidPaperId } from './scholarConstants'
import CiteModal from './cite/CiteModal'
import DiscussionThread from './discussion/DiscussionThread'
import AnnotationToolbar from './annotation/AnnotationToolbar'
import ScholarShell from './ScholarShell'
import SimilarInLibraryBadge from './integration/SimilarInLibraryBadge'
import ShareToStudyGroupButton from './integration/ShareToStudyGroupButton'
import parseSseForSheetId from './integration/parseSseForSheetId'
import useScholarShortcuts from './shortcuts/useScholarShortcuts'
import ScholarKeyboardShortcutsModal, {
  ScholarShortcutsHint,
} from './shortcuts/ScholarKeyboardShortcutsModal'
import './ScholarPage.css'
import './ScholarPaperPage.css'

const RECENT_KEY = 'studyhub.scholar.recentlyViewed'
const FONT_KEY = 'studyhub.scholar.readerFont'
const MAX_RECENT = 10

const TABS = [
  { id: 'abstract', label: 'Abstract' },
  { id: 'references', label: 'References' },
  { id: 'citations', label: 'Citations' },
  { id: 'similar', label: 'Similar' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'annotations', label: 'Annotations' },
]

function authorByline(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return ''
  const names = authors.map((a) => a?.name || '').filter(Boolean)
  if (names.length === 0) return ''
  if (names.length <= 4) return names.join(', ')
  return `${names.slice(0, 4).join(', ')}, et al.`
}

function refMetaLine(ref) {
  const year = ref?.publishedAt ? new Date(ref.publishedAt).getUTCFullYear() : ref?.year || ''
  const parts = []
  const byline = authorByline(ref?.authors)
  if (byline) parts.push(byline)
  if (ref?.venue) parts.push(ref.venue)
  if (year) parts.push(String(year))
  return parts.join(' · ')
}

function readRecentlyViewed() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRecentlyViewed(list) {
  if (typeof localStorage === 'undefined') return
  try {
    // Safari private mode throws on setItem — never let it bubble.
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
  } catch {
    /* ignore */
  }
}

function readFontPref() {
  if (typeof localStorage === 'undefined') return 'serif'
  try {
    const v = localStorage.getItem(FONT_KEY)
    return v === 'sans' ? 'sans' : 'serif'
  } catch {
    return 'serif'
  }
}

function writeFontPref(v) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(FONT_KEY, v)
  } catch {
    /* ignore */
  }
}

function ReferenceList({ items, emptyLabel }) {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div style={{ color: 'var(--sh-subtext)', fontSize: 14, padding: '8px 0' }}>{emptyLabel}</div>
    )
  }
  return (
    <div className="scholar-ref-list">
      {items.map((ref, idx) => {
        const id = ref?.id
        const meta = refMetaLine(ref)
        const title = ref?.title || 'Untitled reference'
        const key = id || `ref-${idx}`
        const inner = (
          <>
            <h4 className="scholar-ref-card__title">{title}</h4>
            {meta && <div className="scholar-ref-card__meta">{meta}</div>}
          </>
        )
        if (id && isValidPaperId(id)) {
          return (
            <Link
              key={key}
              to={`/scholar/paper/${encodeURIComponent(id)}`}
              className="scholar-ref-card"
            >
              {inner}
            </Link>
          )
        }
        return (
          <div key={key} className="scholar-ref-card">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

function PaperSkeleton() {
  return (
    <div aria-hidden="true">
      <span className="scholar-paper__skeleton scholar-paper__skeleton--title" />
      <span className="scholar-paper__skeleton scholar-paper__skeleton--line-short" />
      <span className="scholar-paper__skeleton scholar-paper__skeleton--line" />
      <span className="scholar-paper__skeleton scholar-paper__skeleton--line" />
      <span className="scholar-paper__skeleton scholar-paper__skeleton--line-short" />
    </div>
  )
}

function ActionStack({
  paper,
  isSaved,
  onSave,
  onCiteIntoNote,
  onGenerateSheet,
  onOpenPdf,
  onAnnotate,
  isGenerating,
  layout,
}) {
  const showPdf = Boolean(
    paper?.pdfUrl &&
    (paper?.licenseType === 'open_access' ||
      paper?.license === 'open_access' ||
      paper?.openAccess === true),
  )
  if (layout === 'mobile') {
    return (
      <nav
        className="scholar-paper__mobile-action-bar"
        aria-label="Paper actions"
        // Render placeholder on desktop too, but CSS hides it.
      >
        <button
          type="button"
          onClick={onSave}
          aria-pressed={isSaved}
          aria-label={isSaved ? 'Remove from saved' : 'Save paper'}
        >
          {isSaved ? 'Saved' : 'Save'}
        </button>
        <button type="button" onClick={onCiteIntoNote} aria-label="Cite paper into a note">
          Cite
        </button>
        <button
          type="button"
          className="scholar-paper__action--primary"
          onClick={onGenerateSheet}
          disabled={isGenerating}
          aria-label="Generate study sheet from this paper"
        >
          {isGenerating ? 'Working…' : 'Generate sheet'}
        </button>
        <button type="button" onClick={onAnnotate} aria-label="Open annotations">
          Annotate
        </button>
        {showPdf && (
          <button type="button" onClick={onOpenPdf} aria-label="Open PDF in viewer">
            PDF
          </button>
        )}
      </nav>
    )
  }
  return (
    <div className="scholar-paper__action-stack" aria-label="Paper actions">
      <button
        type="button"
        className={`scholar-paper__action${isSaved ? ' scholar-paper__action--active' : ''}`}
        onClick={onSave}
        aria-pressed={isSaved}
      >
        {isSaved ? 'Saved to shelf' : 'Save'}
      </button>
      <button type="button" className="scholar-paper__action" onClick={onCiteIntoNote}>
        Cite into Note
      </button>
      <button
        type="button"
        className="scholar-paper__action scholar-paper__action--primary"
        onClick={onGenerateSheet}
        disabled={isGenerating}
      >
        {isGenerating ? 'Generating…' : 'Generate study sheet from paper'}
      </button>
      <button type="button" className="scholar-paper__action" onClick={onAnnotate}>
        Annotate
      </button>
      {showPdf && (
        <button type="button" className="scholar-paper__action" onClick={onOpenPdf}>
          Open PDF
        </button>
      )}
    </div>
  )
}

export default function ScholarPaperPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { requestPermission } = useAiPermission()

  const decodedId = useMemo(() => {
    try {
      return decodeURIComponent(id || '')
    } catch {
      return ''
    }
  }, [id])
  const validId = isValidPaperId(decodedId) ? decodedId : null

  usePageTitle('Scholar paper')

  // ── Data: paper, references, citations, similar, annotations ────────
  const paperUrl = validId ? `/api/scholar/paper/${encodeURIComponent(validId)}` : null
  const {
    data: paperData,
    loading: paperLoading,
    error: paperError,
  } = useFetch(paperUrl, {
    skip: !validId,
    swr: 2 * 60 * 1000,
  })
  const paper = paperData?.paper || paperData || null

  const [activeTab, setActiveTab] = useState('abstract')

  const refsUrl =
    validId && activeTab === 'references'
      ? `/api/scholar/paper/${encodeURIComponent(validId)}/references?limit=50`
      : null
  const {
    data: refsData,
    loading: refsLoading,
    error: refsError,
  } = useFetch(refsUrl, {
    skip: !refsUrl,
  })
  const references = useMemo(() => {
    if (!refsData) return []
    if (Array.isArray(refsData?.references)) return refsData.references
    if (Array.isArray(refsData?.results)) return refsData.results
    if (Array.isArray(refsData)) return refsData
    return []
  }, [refsData])

  const citationsUrl =
    validId && activeTab === 'citations'
      ? `/api/scholar/paper/${encodeURIComponent(validId)}/citations?limit=50`
      : null
  const {
    data: citationsData,
    loading: citationsLoading,
    error: citationsError,
  } = useFetch(citationsUrl, { skip: !citationsUrl })
  const citations = useMemo(() => {
    if (!citationsData) return []
    if (Array.isArray(citationsData?.citations)) return citationsData.citations
    if (Array.isArray(citationsData?.results)) return citationsData.results
    if (Array.isArray(citationsData)) return citationsData
    return []
  }, [citationsData])

  const similarUrl =
    validId && activeTab === 'similar'
      ? `/api/scholar/paper/${encodeURIComponent(validId)}/similar?limit=20`
      : null
  // `similarError` intentionally omitted — the Similar tab degrades to the
  // friendly empty-state card on any failure (per design brief, no error
  // toasts on this tab).
  const { data: similarData, loading: similarLoading } = useFetch(similarUrl, {
    skip: !similarUrl,
  })
  const similar = useMemo(() => {
    if (!similarData) return []
    if (Array.isArray(similarData?.similar)) return similarData.similar
    if (Array.isArray(similarData?.results)) return similarData.results
    if (Array.isArray(similarData)) return similarData
    return []
  }, [similarData])
  // Backend may respond with `{ similar: [], reason: 'no_topics' }` when the
  // paper has no topic vector yet — treat that as an empty state, not an error.
  const similarReason =
    similarData && typeof similarData === 'object' && !Array.isArray(similarData)
      ? similarData.reason || null
      : null

  // The backend endpoint is `GET /api/scholar/annotations?paperId=...`
  // (scholar.routes.js) — NOT a REST-nested `/paper/:id/annotations`.
  // The route nests `paperId` as a query param.
  const annotationsUrl =
    validId && activeTab === 'annotations'
      ? `/api/scholar/annotations?paperId=${encodeURIComponent(validId)}`
      : null
  const { data: annotationsData, loading: annotationsLoading } = useFetch(annotationsUrl, {
    skip: !annotationsUrl,
  })
  const annotations = useMemo(() => {
    if (!annotationsData) return []
    if (Array.isArray(annotationsData?.annotations)) return annotationsData.annotations
    if (Array.isArray(annotationsData?.results)) return annotationsData.results
    if (Array.isArray(annotationsData)) return annotationsData
    return []
  }, [annotationsData])

  // ── UI state ─────────────────────────────────────────────────────────
  const [readerFont, setReaderFont] = useState(readFontPref)
  // savedOverride: null = use server-provided value; true/false = local
  // override after the user toggled. Avoids syncing server state into
  // useState via an effect (which would trigger cascading renders and
  // trip react-hooks/set-state-in-effect).
  const [savedOverride, setSavedOverride] = useState(null)
  const isSaved =
    savedOverride !== null
      ? savedOverride
      : Boolean(paper && typeof paper.isSaved === 'boolean' ? paper.isSaved : false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [citeOpen, setCiteOpen] = useState(false)
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  // `pdfLoading` tracks the iframe's network fetch so we can show a
  // skeleton overlay while the PDF byte-streams from R2. Driven by
  // onLoad / onError on the iframe.
  const [pdfLoading, setPdfLoading] = useState(false)
  const [titleBarVisible, setTitleBarVisible] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Reset the local override whenever the paper changes, so navigating
  // between papers doesn't leak the previous paper's "Saved" toggle.
  // Deferred via queueMicrotask to satisfy React Compiler.
  useEffect(() => {
    queueMicrotask(() => setSavedOverride(null))
  }, [validId])

  // `recentlyViewedTick` bumps every time we write to localStorage so
  // the memo recomputes on the next render. We keep the actual list in
  // localStorage (single source of truth) and just trigger re-reads
  // from React — that way we never store derived state in useState and
  // never call setState inside a "sync with external store" effect.
  const [recentlyViewedTick, setRecentlyViewedTick] = useState(0)
  const recentlyViewed = useMemo(() => {
    const list = readRecentlyViewed()
    return list.filter((entry) => entry?.id && entry.id !== validId)
    // recentlyViewedTick intentionally drives recomputation after we
    // write the current paper into localStorage. The linter flags the
    // dep as "unnecessary" because nothing inside the callback references
    // it directly; that's the whole point — it's a re-read signal, not
    // an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validId, recentlyViewedTick])

  const recordedRef = useRef(null)
  useEffect(() => {
    if (!validId || !paper) return
    // Only write once per paper-load to avoid effect loops.
    const key = `${validId}:${paper?.title || ''}`
    if (recordedRef.current === key) return
    recordedRef.current = key
    const list = readRecentlyViewed()
    const entry = {
      id: validId,
      title: paper.title || 'Untitled',
      authors: authorByline(paper.authors),
      viewedAt: Date.now(),
    }
    const next = [entry, ...list.filter((e) => e?.id !== validId)].slice(0, MAX_RECENT)
    writeRecentlyViewed(next)
    setRecentlyViewedTick((n) => n + 1)
  }, [validId, paper])

  // Sticky-collapsing mobile title bar — show once the user has scrolled
  // past the inline title (rough threshold; cheap scroll listener).
  const scrollRef = useRef(0)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    function onScroll() {
      const y = window.scrollY || 0
      scrollRef.current = y
      setTitleBarVisible(y > 140)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleFontChange = useCallback((next) => {
    setReaderFont(next)
    writeFontPref(next)
  }, [])

  const handleSave = useCallback(async () => {
    if (!validId) return
    const desired = !isSaved
    // Real backend routes:
    //   POST   /api/scholar/save           body: { paperId }  → save
    //   DELETE /api/scholar/save/:paperId                    → unsave
    // Prior code always POSTed to /papers/:id/save (404) and
    // fell back to POST /save regardless of `desired`, so unsaving
    // never actually removed the row. Audit Loop S11 (2026-05-13)
    // surfaced this — the bulk Saved-page unsave worked, but the
    // single-paper Save button on the detail page didn't.
    const url = desired
      ? `${API}/api/scholar/save`
      : `${API}/api/scholar/save/${encodeURIComponent(validId)}`
    const init = desired
      ? {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ paperId: validId }),
        }
      : {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        }
    try {
      const res = await fetch(url, init)
      if (!res.ok) throw new Error(`${desired ? 'Save' : 'Unsave'} failed (${res.status})`)
      // Trust server echo if present, otherwise apply requested value.
      let persisted = desired
      try {
        const json = await res.clone().json()
        if (json && typeof json.saved === 'boolean') persisted = json.saved
      } catch {
        /* graceful: server returned no body */
      }
      setSavedOverride(persisted)
      // Invalidate the Saved page's SWR entries (scholar-saved:<query> +
      // scholar-saved:shelves) so it doesn't paint a stale list after the
      // user navigates there. clearFetchCache has no prefix mode, so iterate
      // a snapshot of the exported cache Map.
      for (const key of [...fetchCache.keys()]) {
        if (key.startsWith('scholar-saved:')) clearFetchCache(key)
      }
      showToast(persisted ? 'Saved to your shelf' : 'Removed from shelf', 'success')
    } catch (err) {
      showToast(err?.message || 'Could not save paper', 'error')
    }
  }, [validId, isSaved])

  const handleCiteIntoNote = useCallback(() => {
    setCiteOpen(true)
  }, [])

  const handleAnnotate = useCallback(() => {
    setActiveTab('annotations')
  }, [])

  const handleOpenPdf = useCallback(() => {
    setShowPdfViewer((v) => {
      const next = !v
      // Show the skeleton again on every re-open so the user gets a
      // visible "we're fetching" state. Cleared by the iframe's onLoad.
      if (next) setPdfLoading(true)
      return next
    })
  }, [])

  const handleGenerateSheet = useCallback(async () => {
    if (!validId || isGenerating) return
    const ok = await requestPermission({
      kind: 'ai-generate-sheet',
      title: 'Generate study sheet from paper?',
      summary:
        'Hub AI will read this paper and draft a study sheet. This uses your daily AI quota.',
      preview: paper?.title || '',
      applyLabel: 'Generate',
      rejectLabel: 'Cancel',
    })
    if (!ok) {
      showToast('Discarded — no changes made.', 'info')
      return
    }
    setIsGenerating(true)
    try {
      // Real backend route: POST /api/scholar/ai/generate-sheet with
      // { paperId }. Earlier code POSTed to a nested-REST path that
      // didn't exist (404), fell back to this path. We go straight to
      // the real path — audit Loop S11 (2026-05-13).
      const res = await fetch(`${API}/api/scholar/ai/generate-sheet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ paperId: validId }),
      })
      if (!res.ok) {
        throw new Error(`Sheet prep failed (${res.status})`)
      }
      const payload = await res.json()
      const prompt = payload?.suggestedPrompt || `Generate a study sheet for paperId ${validId}`
      const context = payload?.context || null
      // `/api/ai/messages` expects { content, currentPage, mode } and
      // returns an SSE stream. Earlier code sent { prompt, context,
      // paperId, intent } and read .json() — both wrong.
      const composed = context
        ? `${prompt}\n\n---\nPaper context:\n${JSON.stringify(context, null, 2)}`
        : prompt
      const aiRes = await fetch(`${API}/api/ai/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          content: composed,
          currentPage: `/scholar/paper/${validId}`,
          mode: 'generate-sheet',
        }),
      })
      if (!aiRes.ok) {
        // Hand off to /ai with the suggested prompt as a graceful fallback.
        showToast('Opening Hub AI to finish generating the sheet…', 'info')
        navigate(`/ai?paperId=${encodeURIComponent(validId)}&prompt=${encodeURIComponent(prompt)}`)
        return
      }
      // Stream the SSE body and look for the new sheet id via the
      // shared parseSseForSheetId helper. Returns null on no-body /
      // no-match — handled below by handing off to /ai.
      const newSheetId = await parseSseForSheetId(aiRes).catch(() => null)
      if (newSheetId) {
        navigate(`/sheets/${newSheetId}/lab`)
      } else {
        // No sheet id in the stream — open Hub AI so the user can review
        // whatever the model produced.
        showToast('Sheet drafted — open Hub AI to review the result.', 'info')
        navigate(`/ai?paperId=${encodeURIComponent(validId)}&prompt=${encodeURIComponent(prompt)}`)
      }
    } catch (err) {
      showToast(err?.message || 'Could not start sheet generation', 'error')
    } finally {
      setIsGenerating(false)
    }
  }, [validId, isGenerating, requestPermission, paper, navigate])

  // Keyboard shortcuts: `?` opens help,
  // `s` saves, `a` jumps to Annotations, `c` opens the cite modal,
  // `g` triggers generate-sheet, `Escape` closes overlays. Hook is
  // no-op when the user is typing in an input (built into the hook).
  useScholarShortcuts({
    onOpenShortcuts: () => setShortcutsOpen(true),
    onSave: () => handleSave(),
    onAnnotate: () => handleAnnotate(),
    onCite: () => setCiteOpen(true),
    onGenerateSheet: () => handleGenerateSheet(),
    onCloseOverlay: () => {
      if (citeOpen) setCiteOpen(false)
      else if (shortcutsOpen) setShortcutsOpen(false)
    },
  })

  // ── Render guards ────────────────────────────────────────────────────
  if (!validId) {
    return (
      <ScholarShell mainId="scholar-paper-not-found" mainStyle={{ paddingTop: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-paper)', color: 'var(--sh-heading)' }}>
          Paper not found
        </h1>
        <p style={{ color: 'var(--sh-subtext)' }}>The paper id is malformed.</p>
        <Link to="/scholar" style={{ color: 'var(--sh-brand)' }}>
          ← Back to Scholar
        </Link>
      </ScholarShell>
    )
  }

  const showPdfButton = Boolean(
    paper?.pdfUrl &&
    (paper?.licenseType === 'open_access' ||
      paper?.license === 'open_access' ||
      paper?.openAccess === true),
  )

  const year = paper?.publishedAt ? new Date(paper.publishedAt).getUTCFullYear() : paper?.year || ''

  return (
    <ScholarShell mainId="scholar-paper-viewer">
      <a href="#scholar-paper-actions" className="scholar-skip-link">
        Skip to actions
      </a>

      {/* Sticky-collapsing mobile title bar */}
      <div
        className={`scholar-paper__mobile-titlebar${
          titleBarVisible ? ' scholar-paper__mobile-titlebar--visible' : ''
        }`}
        aria-hidden={!titleBarVisible}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            fontSize: 18,
            color: 'var(--sh-text)',
            padding: 4,
            minWidth: 44,
            minHeight: 44,
            fontFamily: 'inherit',
          }}
        >
          ‹
        </button>
        <span className="scholar-paper__mobile-titlebar-title">{paper?.title || 'Loading…'}</span>
      </div>

      <div className="scholar-paper">
        {/* ── LEFT: paper body ───────────────────────────────────────── */}
        <section
          id="scholar-paper-viewer"
          className="scholar-paper__main"
          aria-label="Paper content"
        >
          {paperLoading && !paper && (
            <div style={{ padding: '16px 0' }}>
              <PaperSkeleton />
            </div>
          )}

          {paperError && !paper && (
            <div
              role="alert"
              style={{
                color: 'var(--sh-danger-text)',
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                padding: 14,
                borderRadius: 10,
                marginTop: 16,
              }}
            >
              {paperError}
            </div>
          )}

          {paper && (
            <>
              <header className="scholar-paper__header">
                <h1 className="scholar-paper__title">{paper.title || 'Untitled paper'}</h1>
                {authorByline(paper.authors) && (
                  <p className="scholar-paper__byline">{authorByline(paper.authors)}</p>
                )}
                <div className="scholar-paper__meta">
                  {paper.venue && <span>{paper.venue}</span>}
                  {year && <span>· {year}</span>}
                  {paper.doi && (
                    <span>
                      ·{' '}
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        doi:{paper.doi}
                      </a>
                    </span>
                  )}
                  {typeof paper.citationCount === 'number' && (
                    <span>· {paper.citationCount} citations</span>
                  )}
                </div>
              </header>

              {paper.tldr && typeof paper.tldr === 'string' && paper.tldr.trim().length > 0 && (
                <aside className="scholar-paper__tldr" aria-label="AI summary">
                  <div className="scholar-paper__tldr-label">Generated by Hub AI</div>
                  <p className="scholar-paper__tldr-body">{paper.tldr}</p>
                </aside>
              )}

              <div className="scholar-paper__reading-controls">
                <div
                  className="scholar-paper__font-toggle"
                  role="radiogroup"
                  aria-label="Reading font"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={readerFont === 'serif'}
                    aria-pressed={readerFont === 'serif'}
                    onClick={() => handleFontChange('serif')}
                  >
                    Serif
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={readerFont === 'sans'}
                    aria-pressed={readerFont === 'sans'}
                    onClick={() => handleFontChange('sans')}
                  >
                    Sans
                  </button>
                </div>
              </div>

              <div role="tablist" aria-label="Paper sections" className="scholar-paper__tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`scholar-tab-panel-${tab.id}`}
                    className="scholar-paper__tab"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div
                id={`scholar-tab-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`scholar-tab-${activeTab}`}
              >
                {activeTab === 'abstract' && (
                  <article
                    className={`scholar-paper__reading${
                      readerFont === 'sans' ? ' scholar-paper__reading--sans' : ''
                    }`}
                  >
                    {showPdfViewer && showPdfButton ? (
                      <div
                        className="scholar-paper__pdf-reader"
                        role="region"
                        aria-label="PDF reader"
                      >
                        <div className="scholar-paper__pdf-toolbar">
                          <span className="scholar-paper__pdf-toolbar-label">
                            {pdfLoading ? 'Loading PDF…' : 'Reading inline'}
                          </span>
                          <div className="scholar-paper__pdf-toolbar-actions">
                            <a
                              className="scholar-paper__pdf-toolbar-btn"
                              href={paper.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open PDF in a new browser tab"
                            >
                              Open in new tab
                            </a>
                            <button
                              type="button"
                              className="scholar-paper__pdf-toolbar-btn"
                              onClick={handleOpenPdf}
                              aria-label="Close PDF reader"
                            >
                              Close reader
                            </button>
                          </div>
                        </div>
                        <div className="scholar-paper__pdf-frame-wrap">
                          {pdfLoading && (
                            <div
                              className="scholar-paper__pdf-loading"
                              role="status"
                              aria-live="polite"
                            >
                              <span
                                className="scholar-paper__pdf-loading-spinner"
                                aria-hidden="true"
                              />
                              <span>Loading PDF — large papers may take a few seconds.</span>
                            </div>
                          )}
                          <iframe
                            title={`PDF viewer for ${paper.title || 'paper'}`}
                            src={paper.pdfUrl}
                            className="scholar-paper__pdf-frame"
                            /* allow-scripts allow-popups allow-forms only — NEVER
                               allow-same-origin (CLAUDE.md A14). The signed R2
                               URL embeds the document; `allow-same-origin` would
                               grant it parent-cookie access. */
                            sandbox="allow-scripts allow-popups allow-forms"
                            onLoad={() => {
                              // Defer the setState until after the iframe load
                              // event finishes propagating — keeps React Compiler
                              // happy (no set-state-in-effect) and avoids racing
                              // an in-flight render.
                              queueMicrotask(() => setPdfLoading(false))
                            }}
                            onError={() => {
                              queueMicrotask(() => setPdfLoading(false))
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p>
                        {paper.abstract ||
                          'No abstract is available for this paper. Try the references or citations tabs for related work.'}
                      </p>
                    )}
                  </article>
                )}

                {activeTab === 'references' && (
                  <div>
                    {refsLoading && <PaperSkeleton />}
                    {refsError && (
                      <div
                        role="alert"
                        style={{
                          color: 'var(--sh-danger-text)',
                          background: 'var(--sh-danger-bg)',
                          padding: 12,
                          borderRadius: 8,
                          fontSize: 14,
                        }}
                      >
                        {refsError}
                      </div>
                    )}
                    {!refsLoading && !refsError && (
                      <ReferenceList
                        items={references}
                        emptyLabel="No references available for this paper."
                      />
                    )}
                  </div>
                )}

                {activeTab === 'citations' && (
                  <div>
                    {citationsLoading && <PaperSkeleton />}
                    {citationsError && (
                      <div
                        role="alert"
                        style={{
                          color: 'var(--sh-danger-text)',
                          background: 'var(--sh-danger-bg)',
                          padding: 12,
                          borderRadius: 8,
                          fontSize: 14,
                        }}
                      >
                        {citationsError}
                      </div>
                    )}
                    {!citationsLoading && !citationsError && (
                      <ReferenceList items={citations} emptyLabel="No citing papers found yet." />
                    )}
                  </div>
                )}

                {activeTab === 'similar' && (
                  <div data-similar-reason={similarReason || undefined}>
                    {similarLoading && <PaperSkeleton />}
                    {/* `no_topics` is a documented, non-error empty state
                        (paper has no topic vector yet). Render the same
                        friendly empty card; never surface an error toast. */}
                    {!similarLoading && similar.length === 0 && (
                      <div className="scholar-paper__similar-empty" role="status">
                        <p className="scholar-paper__similar-empty-title">
                          No similar papers found yet.
                        </p>
                        <p className="scholar-paper__similar-empty-sub">
                          Try the References or Citations tabs — they&rsquo;re computed from the
                          paper&rsquo;s own metadata.
                        </p>
                        <div className="scholar-paper__similar-empty-actions">
                          <button
                            type="button"
                            className="scholar-paper__similar-empty-link"
                            onClick={() => setActiveTab('references')}
                          >
                            View references
                          </button>
                          <button
                            type="button"
                            className="scholar-paper__similar-empty-link"
                            onClick={() => setActiveTab('citations')}
                          >
                            View citations
                          </button>
                        </div>
                      </div>
                    )}
                    {!similarLoading && similar.length > 0 && (
                      <ReferenceList items={similar} emptyLabel="No similar papers found yet." />
                    )}
                  </div>
                )}

                {activeTab === 'discussion' && <DiscussionThread paperId={validId} />}

                {activeTab === 'annotations' && (
                  <div>
                    <AnnotationToolbar
                      position={{ top: 0, left: 0 }}
                      activeColor="yellow"
                      onColorChange={() => {}}
                      onSave={() => showToast('Highlight saved', 'success')}
                      onClose={() => {}}
                    />
                    {annotationsLoading && <PaperSkeleton />}
                    {!annotationsLoading && annotations.length === 0 && (
                      <div className="scholar-paper__annotations-empty" role="status">
                        <p className="scholar-paper__annotations-empty-title">
                          Select text in the paper body to add the first annotation.
                        </p>
                        <p className="scholar-paper__annotations-empty-sub">
                          Highlights are private by default. You can change visibility per
                          annotation after saving.
                        </p>
                      </div>
                    )}
                    {!annotationsLoading && annotations.length > 0 && (
                      <div className="scholar-ref-list">
                        {annotations.map((a, i) => (
                          <div key={a?.id || `ann-${i}`} className="scholar-ref-card">
                            <h4 className="scholar-ref-card__title">
                              {a?.body || a?.highlightText || 'Annotation'}
                            </h4>
                            {a?.color && <div className="scholar-ref-card__meta">{a.color}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── RIGHT: sidebar (desktop) ──────────────────────────────── */}
        <aside
          id="scholar-paper-actions"
          className="scholar-paper__sidebar"
          aria-label="Paper actions and connected work"
        >
          <ActionStack
            paper={paper}
            isSaved={isSaved}
            onSave={handleSave}
            onCiteIntoNote={handleCiteIntoNote}
            onGenerateSheet={handleGenerateSheet}
            onOpenPdf={handleOpenPdf}
            onAnnotate={handleAnnotate}
            isGenerating={isGenerating}
            layout="desktop"
          />

          {/* TODO v2: D3 force-directed similarity graph */}

          {/* "N in your library" chip — silent no-op when the user has
              no saved papers similar to this one, so safe to render
              unconditionally. */}
          {paper ? <SimilarInLibraryBadge paper={paper} /> : null}

          {/* Share this paper into a study group as a link resource. */}
          {paper ? (
            <div style={{ marginTop: 10 }}>
              <ShareToStudyGroupButton paper={paper} />
            </div>
          ) : null}

          <div className="scholar-paper__sidebar-card">
            <h3 className="scholar-paper__sidebar-card-title">Recently viewed</h3>
            {recentlyViewed.length === 0 ? (
              <div className="scholar-paper__recent-empty">
                <p>Papers you open will appear here — start by saving this one.</p>
                <button
                  type="button"
                  className="scholar-paper__recent-save-shortcut"
                  onClick={handleSave}
                  aria-pressed={isSaved}
                >
                  {isSaved ? 'Saved to shelf' : 'Save this paper'}
                </button>
              </div>
            ) : (
              recentlyViewed.slice(0, 5).map((entry) => (
                <Link
                  key={entry.id}
                  to={`/scholar/paper/${encodeURIComponent(entry.id)}`}
                  className="scholar-paper__recent-item"
                  title={entry.title}
                >
                  {entry.title}
                </Link>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* Mobile-only action bar (CSS hides on ≥768px). */}
      <ActionStack
        paper={paper}
        isSaved={isSaved}
        onSave={handleSave}
        onCiteIntoNote={handleCiteIntoNote}
        onGenerateSheet={handleGenerateSheet}
        onOpenPdf={handleOpenPdf}
        onAnnotate={handleAnnotate}
        isGenerating={isGenerating}
        layout="mobile"
      />

      {citeOpen && validId && (
        <CiteModal paperId={validId} paperTitle={paper?.title} onClose={() => setCiteOpen(false)} />
      )}

      <ScholarKeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ScholarShortcutsHint onOpen={() => setShortcutsOpen(true)} />
    </ScholarShell>
  )
}
