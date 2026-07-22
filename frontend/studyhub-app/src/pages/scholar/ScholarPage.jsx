/**
 * ScholarPage.jsx — Scholar landing at `/scholar`.
 *
 * Redesigned 2026-05-12 to feel native to StudyHub (Campus Lab identity).
 * Drops the editorial-serif hero in favor of sans-serif chrome that matches
 * FeedPage / LibraryPage rhythm: 12px card radius, --shadow-sm baseline,
 * consistent spacing.
 *
 * Blocks (top to bottom, single column with optional right rail ≥1024px):
 *  1. Hero search input (centered, autofocus, Enter → /scholar/search?q=…)
 *  2. "Recently viewed" strip (localStorage, dismissable chips, hidden if empty)
 *  3. "Recent at your school" (GET /api/scholar/discover?scope=school)
 *  4. "Trending in the network" (GET /api/scholar/discover?scope=trending)
 *  5. Topic tiles (static chip grid → /scholar/topic/:slug)
 *  6. Side rail (desktop only): saved-papers link, citation-export pitch,
 *     plain-English explainer.
 *
 * Backend dependency: /api/scholar/discover is owned by agent S15 and may
 * not be live yet — we render an empty state instead of crashing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'
import useFetch from '../../lib/useFetch'
import { Skeleton } from '../../components/Skeleton'
import PaperCard from './paperCard/PaperCard'
import CiteModal from './cite/CiteModal'
import useSavedPapers from './useSavedPapers'
import { POPULAR_TOPICS, TRY_CHIPS, formatCount } from './scholarConstants'
import ScholarShell from './ScholarShell'
import './ScholarPage.css'

// localStorage key for the "Recently viewed" strip. Other Scholar pages
// append to this key when a paper detail is opened; the landing only reads.
const RECENTLY_VIEWED_KEY = 'studyhub.scholar.recentlyViewed'
const RECENTLY_VIEWED_LIMIT = 10

// Curated landing-page topic shortlist (subset of POPULAR_TOPICS keyed by
// slug). 12 tiles balances scannability with breadth per the brief.
const LANDING_TOPIC_SLUGS = [
  'mathematics',
  'machine-learning',
  'cell-biology',
  'chemistry',
  'physics-general',
  'psychology',
  'economics',
  'linguistics',
  'medicine',
  'neuroscience',
  'sociology',
  'statistics',
]

function readRecentlyViewed() {
  // Safari private mode throws on localStorage access. Wrap in try/catch
  // and return [] on any error so the section hides gracefully.
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p === 'object' && typeof p.id === 'string')
      .slice(0, RECENTLY_VIEWED_LIMIT)
  } catch {
    return []
  }
}

function writeRecentlyViewed(list) {
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list))
  } catch {
    // Quota / private mode — silently drop the write.
  }
}

function paperYear(paper) {
  if (!paper?.publishedAt) return ''
  const y = new Date(paper.publishedAt).getUTCFullYear()
  return Number.isFinite(y) ? String(y) : ''
}

function firstAuthorName(paper) {
  if (!Array.isArray(paper?.authors) || paper.authors.length === 0) return ''
  return paper.authors[0]?.name || ''
}

function venueOrYear(paper) {
  const year = paperYear(paper)
  if (paper?.venue && year) return `${paper.venue} · ${year}`
  return paper?.venue || year || ''
}

function safePapers(payload) {
  // /api/scholar/discover is expected to return { results: Paper[] }.
  // Defensively unwrap so a backend change doesn't blow up the landing.
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.results)) return payload.results
  if (Array.isArray(payload.papers)) return payload.papers
  return []
}

export default function ScholarPage() {
  usePageTitle('Scholar')
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [searchInput, setSearchInput] = useState('')
  const [recentlyViewed, setRecentlyViewed] = useState(() => readRecentlyViewed())

  // Autofocus the hero search on mount (desktop only — skip on touch to
  // avoid forcing the keyboard up on phones).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isTouchOnly = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
    if (isTouchOnly) return
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // Two discover feeds. swr:60s keeps the landing snappy on back-nav.
  // useFetch handles `credentials: 'include'` internally.
  const schoolDiscover = useFetch('/api/scholar/discover?scope=school&limit=8', {
    swr: 60_000,
    transform: safePapers,
    initialData: [],
  })
  const trendingDiscover = useFetch('/api/scholar/discover?scope=trending&limit=8', {
    swr: 60_000,
    transform: safePapers,
    initialData: [],
  })

  // Live corpus stats for the hero (papers indexed / open access). The
  // line hides entirely on error or a cold, zero-count database — never
  // advertise "0 papers".
  const stats = useFetch('/api/scholar/stats', { swr: 300_000 })
  const statsPapers = Number.isFinite(stats.data?.papers) ? stats.data.papers : 0
  const statsOa = Number.isFinite(stats.data?.openAccess) ? stats.data.openAccess : 0

  // Inline card actions shared by both discover grids.
  const { savedIds, toggleSave } = useSavedPapers()
  const [citePaper, setCitePaper] = useState(null)

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault?.()
      const q = searchInput.trim()
      if (!q) return
      navigate(`/scholar/search?q=${encodeURIComponent(q)}`)
    },
    [navigate, searchInput],
  )

  const handleDismissRecent = useCallback(
    (id, e) => {
      // Dismiss the chip without navigating — the parent <Link> would
      // otherwise capture the click.
      e?.preventDefault?.()
      e?.stopPropagation?.()
      const next = recentlyViewed.filter((p) => p.id !== id)
      setRecentlyViewed(next)
      writeRecentlyViewed(next)
    },
    [recentlyViewed],
  )

  const landingTopics = LANDING_TOPIC_SLUGS.map((slug) =>
    POPULAR_TOPICS.find((t) => t.slug === slug),
  ).filter(Boolean)

  const schoolPapers = Array.isArray(schoolDiscover.data) ? schoolDiscover.data : []
  const trendingPapers = Array.isArray(trendingDiscover.data) ? trendingDiscover.data : []

  return (
    <ScholarShell mainId="scholar-main">
      <div className="scholar-landing">
        <div className="scholar-landing__primary">
          {/* ── Block 1: Hero search ─────────────────────────────────── */}
          <section className="scholar-landing-hero" aria-labelledby="scholar-hero-title">
            <h1 id="scholar-hero-title" className="scholar-landing-hero__title">
              Scholar
            </h1>
            <p className="scholar-landing-hero__sub">
              Search the academic literature, read open-access PDFs in-app, and cite straight into
              your notes.
            </p>
            <form
              className="scholar-landing-search"
              onSubmit={handleSubmit}
              role="search"
              aria-label="Search Scholar"
            >
              <svg
                className="scholar-landing-search__icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                className="scholar-landing-search__input"
                placeholder="Search 200M+ papers — by title, author, DOI, or arXiv ID"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search Scholar by title, author, DOI, or arXiv ID"
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="submit"
                className="scholar-landing-search__submit"
                disabled={!searchInput.trim()}
              >
                Search
              </button>
            </form>

            {/* Example queries — kills blank-page paralysis on first visit. */}
            <div className="scholar-landing-try" aria-label="Example searches">
              <span className="scholar-landing-try__label">Try</span>
              {TRY_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="scholar-landing-try__chip"
                  onClick={() => navigate(`/scholar/search?q=${encodeURIComponent(chip)}`)}
                >
                  {chip}
                </button>
              ))}
            </div>

            {statsPapers > 0 && (
              <p className="scholar-landing-hero__stats">
                {formatCount(statsPapers)} papers indexed by StudyHub
                {statsOa > 0 ? ` · ${formatCount(statsOa)} open access` : ''} · pulled from Semantic
                Scholar, OpenAlex, CrossRef, arXiv, and Unpaywall
              </p>
            )}
          </section>

          {/* ── Block 2: Recently viewed (hide when empty) ──────────── */}
          {recentlyViewed.length > 0 && (
            <section className="scholar-landing-section" aria-labelledby="scholar-recent-heading">
              <header className="scholar-landing-section__head">
                <h2 id="scholar-recent-heading" className="scholar-landing-section__title">
                  Recently viewed
                </h2>
              </header>
              <ul className="scholar-recent-strip scholar-recent-strip--fade-in" role="list">
                {recentlyViewed.map((paper) => {
                  const sub = [firstAuthorName(paper), venueOrYear(paper)]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={paper.id} className="scholar-recent-strip__item">
                      <Link
                        to={`/scholar/paper/${encodeURIComponent(paper.id)}`}
                        className="scholar-recent-chip"
                      >
                        <span className="scholar-recent-chip__title">
                          {paper.title || 'Untitled paper'}
                        </span>
                        {sub && <span className="scholar-recent-chip__sub">{sub}</span>}
                        <button
                          type="button"
                          className="scholar-recent-chip__dismiss"
                          onClick={(e) => handleDismissRecent(paper.id, e)}
                          aria-label={`Remove ${paper.title || 'paper'} from recently viewed`}
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
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* ── Block 3: Recent at your school ──────────────────────── */}
          <section className="scholar-landing-section" aria-labelledby="scholar-school-heading">
            <header className="scholar-landing-section__head">
              <h2 id="scholar-school-heading" className="scholar-landing-section__title">
                Recent at your school
              </h2>
              <p className="scholar-landing-section__sub">
                Papers classmates have opened in the last 14 days.
              </p>
            </header>
            {schoolDiscover.loading ? (
              <div className="scholar-landing-grid">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={180} borderRadius={12} />
                ))}
              </div>
            ) : schoolPapers.length === 0 ? (
              <div className="scholar-landing-empty">
                <h3 className="scholar-landing-empty__headline">
                  Be the first to seed Scholar at your school
                </h3>
                <p className="scholar-landing-empty__body">
                  Search for a paper — your classmates will see it here next time they visit.
                </p>
                <Link to="/scholar/search" className="scholar-landing-empty__cta-primary">
                  Search papers
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
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ) : (
              <div className="scholar-landing-grid scholar-landing-grid--fade-in">
                {schoolPapers.slice(0, 8).map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    saved={savedIds.has(paper.id)}
                    onSave={toggleSave}
                    onCite={setCitePaper}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Block 4: Trending in the network ────────────────────── */}
          <section className="scholar-landing-section" aria-labelledby="scholar-trending-heading">
            <header className="scholar-landing-section__head">
              <h2 id="scholar-trending-heading" className="scholar-landing-section__title">
                Trending in the network
              </h2>
              <p className="scholar-landing-section__sub">
                What StudyHub members across every school are reading right now.
              </p>
            </header>
            {trendingDiscover.loading ? (
              <div className="scholar-landing-grid">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={180} borderRadius={12} />
                ))}
              </div>
            ) : trendingPapers.length === 0 ? (
              <div className="scholar-landing-empty">
                <h3 className="scholar-landing-empty__headline">
                  The trending feed warms up as people search
                </h3>
                <p className="scholar-landing-empty__body">
                  Every search across StudyHub feeds the trending list. Run one to seed what your
                  peers are about to discover.
                </p>
                <Link to="/scholar/search" className="scholar-landing-empty__cta-primary">
                  Search 200M+ papers
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
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ) : (
              <div className="scholar-landing-grid scholar-landing-grid--fade-in">
                {trendingPapers.slice(0, 8).map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    saved={savedIds.has(paper.id)}
                    onSave={toggleSave}
                    onCite={setCitePaper}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Block 5: Topic tiles ─────────────────────────────────── */}
          <section className="scholar-landing-section" aria-labelledby="scholar-topics-heading">
            <header className="scholar-landing-section__head">
              <h2 id="scholar-topics-heading" className="scholar-landing-section__title">
                Browse by topic
              </h2>
            </header>
            <ul className="scholar-topic-tiles" role="list">
              {landingTopics.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    to={`/scholar/topic/${topic.slug}`}
                    className="scholar-topic-tile"
                    aria-label={`Browse ${topic.label} papers`}
                  >
                    <span className="scholar-topic-tile__label">{topic.label}</span>
                    <span className="scholar-topic-tile__count">{topic.count} papers</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ── Block 6: Side rail (desktop only ≥1024px) ─────────────── */}
        <aside className="scholar-landing__rail" aria-label="Scholar shortcuts">
          <div className="scholar-rail-card">
            <h3 className="scholar-rail-card__title">Your saved papers</h3>
            <p className="scholar-rail-card__body">
              Bookmark a paper from its detail page to start a personal reading list.
            </p>
            <Link to="/scholar/saved" className="scholar-rail-card__cta">
              Open saved papers
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
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="scholar-rail-card">
            <h3 className="scholar-rail-card__title">Cite in 8 styles</h3>
            <p className="scholar-rail-card__body">
              Export to BibTeX, RIS, CSL JSON, APA, MLA, Chicago, IEEE, or Harvard — copy or drop
              straight into a StudyHub note.
            </p>
            <ul className="scholar-rail-card__chips" role="list">
              {['BibTeX', 'APA', 'MLA', 'Chicago', 'IEEE'].map((s) => (
                <li key={s} className="scholar-rail-card__chip">
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="scholar-rail-card">
            <h3 className="scholar-rail-card__title">What is Scholar?</h3>
            <p className="scholar-rail-card__body">
              Scholar pulls from Semantic Scholar, OpenAlex, CrossRef, arXiv, and Unpaywall so you
              can search hundreds of millions of papers in one place. Open-access PDFs read inside
              StudyHub; everything else links out cleanly.
            </p>
          </div>
        </aside>
      </div>

      {citePaper && (
        <CiteModal
          paperId={citePaper.id}
          paperTitle={citePaper.title}
          onClose={() => setCitePaper(null)}
        />
      )}
    </ScholarShell>
  )
}
