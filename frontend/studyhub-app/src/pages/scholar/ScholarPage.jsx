/**
 * ScholarPage.jsx — Scholar landing at `/scholar`.
 *
 * Implements Figma §3 + §23.2:
 *  - Hero (centered, italic+gradient on "Read it here", glass search,
 *    Filters, try-chips, stats strip)
 *  - "Trending in your field" featured grid (placeholder until backend
 *    data arrives — calls /api/scholar/search?q=trending&limit=4)
 *  - "Saved papers" compact grid
 *  - "Browse by topic" chip cloud
 *  - "Recent at your school" list
 *
 * The landing uses real data when the backend returns it (search +
 * stats), and renders empty-states gracefully when the corpus is sparse
 * (Week 4 has only just started populating the cache).
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { usePageTitle } from '../../lib/usePageTitle'
import { API } from '../../config'
import PaperCard from './paperCard/PaperCard'
import { TRY_CHIPS, POPULAR_TOPICS, formatCount } from './scholarConstants'
import ScholarFiltersDrawer from './ScholarFiltersDrawer'
import './ScholarPage.css'

// Stats cache: 1h TTL, surfaces instantly on remount instead of letting
// the hardcoded fallback flash before the live response arrives.
const STATS_CACHE_KEY = 'studyhub.scholar.stats.v1'
const STATS_TTL_MS = 60 * 60 * 1000

function readStatsCache() {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.fetchedAt !== 'number') return null
    if (Date.now() - parsed.fetchedAt > STATS_TTL_MS) return null
    if (!parsed.value || typeof parsed.value !== 'object') return null
    return parsed.value
  } catch {
    // Safari private mode + JSON.parse failures both end up here.
    return null
  }
}

function writeStatsCache(value) {
  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ value, fetchedAt: Date.now() }))
  } catch {
    // Storage quota / private mode — stats refresh on next mount instead.
  }
}

export default function ScholarPage() {
  usePageTitle('Scholar')
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const filtersBtnRef = useRef(null)
  const [searchInput, setSearchInput] = useState('')
  const [trending, setTrending] = useState([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  // Saved-papers preview is reserved for a future endpoint; the section
  // currently renders an empty state and a "See all →" link to /scholar/saved.
  const [saved] = useState([])
  // Hydrate stats from localStorage on first render so the visible stats
  // never flash from "212M / 48M / 3.4M" → live values on remount.
  // `stats === null` means we have nothing real to show yet → render skeletons.
  const [stats, setStats] = useState(() => readStatsCache())
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Fetch hero stats (SWR-style: cached value rendered first, network
  // fetch refreshes both state + localStorage). Degrades gracefully on
  // network failure — last-known cached value stays on screen.
  useEffect(() => {
    let aborted = false
    fetch(`${API}/api/scholar/stats`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (aborted || !json || typeof json !== 'object') return
        setStats(json)
        writeStatsCache(json)
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [])

  // Fetch trending (calls /search with a generic query to populate the
  // landing without a dedicated endpoint; revisit when topic-feed data
  // is denser). `trendingLoading` is initialized to true via lazy
  // useState so the effect body does not need to call setState
  // synchronously before kicking off the fetch.
  useEffect(() => {
    let aborted = false
    fetch(`${API}/api/scholar/search?q=machine+learning&limit=4`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((json) => {
        if (!aborted) setTrending(Array.isArray(json.results) ? json.results : [])
      })
      .catch(() => {
        if (!aborted) setTrending([])
      })
      .finally(() => {
        if (!aborted) setTrendingLoading(false)
      })
    return () => {
      aborted = true
    }
  }, [])

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault()
      const q = searchInput.trim()
      if (!q) return
      navigate(`/scholar/search?q=${encodeURIComponent(q)}`)
    },
    [navigate, searchInput],
  )

  const handleTryChip = useCallback(
    (chip) => {
      navigate(`/scholar/search?q=${encodeURIComponent(chip)}`)
    },
    [navigate],
  )

  return (
    <div className="scholar-page">
      <Navbar />
      <a href="#scholar-main" className="scholar-skip-link">
        Skip to main content
      </a>

      <section className="scholar-hero" aria-labelledby="scholar-hero-title">
        <div className="scholar-hero__pill">Scholar · powered by Hub AI</div>
        <h1 id="scholar-hero-title" className="scholar-hero__title">
          Find the paper. <span className="scholar-hero__title-accent">Read it here.</span> Cite it
          everywhere.
        </h1>
        <p className="scholar-hero__subline">
          A literature workspace for college students. Search 200M+ papers, read PDFs in-app, ask AI
          for context, and cite directly into your notes.
        </p>

        <form className="scholar-hero__search" onSubmit={handleSubmit}>
          <div className="scholar-search-box">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              style={{ color: 'var(--sh-muted)' }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              placeholder="Search 200M papers, authors, DOIs…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search Scholar"
            />
            <kbd className="scholar-search-box__kbd" aria-hidden="true">
              ⌘K
            </kbd>
          </div>
          <button
            type="button"
            ref={filtersBtnRef}
            className="scholar-filters-btn"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            aria-label="Open filters"
          >
            Filters
          </button>
        </form>

        <ScholarFiltersDrawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          returnFocusRef={filtersBtnRef}
        />

        <div className="scholar-try-chips">
          {TRY_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="scholar-try-chip"
              onClick={() => handleTryChip(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="scholar-stats" aria-label="Scholar corpus stats">
          <div className="scholar-stat">
            {stats ? (
              <div className="scholar-stat__value">{formatCount(stats.papers || 0)}</div>
            ) : (
              <span className="scholar-skeleton scholar-skeleton--stat-value" aria-hidden="true" />
            )}
            <div className="scholar-stat__label">Papers · across 5 sources</div>
          </div>
          <div className="scholar-stat">
            {stats ? (
              <div className="scholar-stat__value">{formatCount(stats.openAccess || 0)}</div>
            ) : (
              <span className="scholar-skeleton scholar-skeleton--stat-value" aria-hidden="true" />
            )}
            <div className="scholar-stat__label">Open access · free to read</div>
          </div>
          <div className="scholar-stat">
            {stats ? (
              <div className="scholar-stat__value">{formatCount(stats.thisYear || 0)}</div>
            ) : (
              <span className="scholar-skeleton scholar-skeleton--stat-value" aria-hidden="true" />
            )}
            <div className="scholar-stat__label">This year · new in 2026</div>
          </div>
        </div>
      </section>

      <main id="scholar-main" className="scholar-shell">
        {/* Featured this week */}
        <section className="scholar-section">
          <div className="scholar-section__head">
            <div>
              <div className="scholar-section__eyebrow">Featured this week</div>
              <h2 className="scholar-section__title">Trending in your field</h2>
            </div>
            {/* Copilot fix: search backend keys off ?q= only (no sort param).
                Use the same seed query the section is populated with so
                "See all" lands on a populated page. */}
            <Link className="scholar-section__see-all" to="/scholar/search?q=machine+learning">
              See all →
            </Link>
          </div>
          {trendingLoading ? (
            <div className="paper-card-grid" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="scholar-skeleton" style={{ height: 180, width: '100%' }} />
              ))}
            </div>
          ) : trending.length === 0 ? (
            <div
              style={{
                color: 'var(--sh-subtext)',
                background: 'var(--sh-soft)',
                padding: '24px',
                borderRadius: '14px',
                border: '1px solid var(--sh-border)',
              }}
            >
              No trending papers yet. Try a search above.
            </div>
          ) : (
            <div className="paper-card-grid">
              {trending.slice(0, 4).map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>
          )}
        </section>

        {/* Saved papers */}
        <section className="scholar-section">
          <div className="scholar-section__head">
            <div>
              <div className="scholar-section__eyebrow">Your library</div>
              <h2 className="scholar-section__title">Saved papers</h2>
            </div>
            <Link className="scholar-section__see-all" to="/scholar/saved">
              See all →
            </Link>
          </div>
          {saved.length === 0 ? (
            <div
              style={{
                color: 'var(--sh-subtext)',
                background: 'var(--sh-soft)',
                padding: '24px',
                borderRadius: '14px',
                border: '1px solid var(--sh-border)',
              }}
            >
              You haven't saved any papers yet. Bookmark from a paper page to start a reading list.
            </div>
          ) : (
            <div className="paper-card-grid">
              {saved.map((paper) => (
                <PaperCard key={paper.id} paper={paper} variant="compact" />
              ))}
            </div>
          )}
        </section>

        {/* Browse by topic */}
        <section className="scholar-section">
          <div className="scholar-section__head">
            <div>
              <div className="scholar-section__eyebrow">Explore</div>
              <h2 className="scholar-section__title">Browse by topic</h2>
            </div>
          </div>
          <div className="topic-cloud">
            {POPULAR_TOPICS.map((topic) => (
              <Link key={topic.slug} className="topic-chip" to={`/scholar/topic/${topic.slug}`}>
                <span className="topic-chip__label">{topic.label}</span>
                <span className="topic-chip__count">{topic.count} papers</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
