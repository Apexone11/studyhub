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
import './ScholarPage.css'

export default function ScholarPage() {
  usePageTitle('Scholar')
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [searchInput, setSearchInput] = useState('')
  const [trending, setTrending] = useState([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  // Saved-papers preview is reserved for a future endpoint; the section
  // currently renders an empty state and a "See all →" link to /scholar/saved.
  const [saved] = useState([])
  const [stats, setStats] = useState({ papers: 0, openAccess: 0, thisYear: 0 })

  // Fetch hero stats (degrades gracefully)
  useEffect(() => {
    let aborted = false
    fetch(`${API}/api/scholar/stats`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { papers: 0, openAccess: 0, thisYear: 0 }))
      .then((json) => {
        if (!aborted) setStats(json)
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
          <button type="button" className="scholar-filters-btn" aria-label="Open filters">
            Filters
          </button>
        </form>

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
            <div className="scholar-stat__value">{formatCount(stats.papers || 212_000_000)}</div>
            <div className="scholar-stat__label">Papers · across 5 sources</div>
          </div>
          <div className="scholar-stat">
            <div className="scholar-stat__value">{formatCount(stats.openAccess || 48_000_000)}</div>
            <div className="scholar-stat__label">Open access · free to read</div>
          </div>
          <div className="scholar-stat">
            <div className="scholar-stat__value">{formatCount(stats.thisYear || 3_400_000)}</div>
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
            <div style={{ color: 'var(--sh-subtext)' }}>Loading…</div>
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
