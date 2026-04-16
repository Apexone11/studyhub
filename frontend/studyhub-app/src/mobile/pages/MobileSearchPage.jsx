// src/mobile/pages/MobileSearchPage.jsx
// Global search — searches sheets, users, courses, notes, groups.
// Uses the unified /api/search endpoint.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch ─────────────────────────────────────────────────────── */

async function searchAll(query) {
  if (!query || query.length < 2) return null
  const res = await fetch(`${API}/api/search?q=${encodeURIComponent(query)}&type=all&limit=10`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

/* ── Result section ────────────────────────────────────────────── */

function ResultSection({ title, items, renderItem }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mob-search-section">
      <h3 className="mob-search-section-title">{title}</h3>
      <div className="mob-search-section-list">{items.map(renderItem)}</div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────── */

export default function MobileSearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  const debounceRef = useRef(null)

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query || query.length < 2) {
      setResults(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchAll(query)
        setResults(data?.results || null)
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Animate results in
  useEffect(() => {
    if (loading || PREFERS_REDUCED || !resultsRef.current) return
    anime({
      targets: resultsRef.current.children,
      translateY: [8, 0],
      opacity: [0, 1],
      duration: 250,
      delay: anime.stagger(40),
      easing: 'easeOutCubic',
    })
  }, [loading, results])

  const goSheet = useCallback((id) => navigate(`/m/sheets/${id}`), [navigate])
  const goUser = useCallback((id) => navigate(`/m/users/${id}`), [navigate])
  const goGroup = useCallback((id) => navigate(`/m/groups/${id}`), [navigate])
  const goNote = useCallback((id) => navigate(id ? `/m/notes/${id}` : '/m/notes'), [navigate])

  const hasResults =
    results &&
    (results.sheets?.length ||
      results.users?.length ||
      results.courses?.length ||
      results.notes?.length ||
      results.groups?.length)

  return (
    <div className="mob-search">
      <MobileTopBar title="Search" showBack />

      {/* Search input */}
      <div className="mob-search-bar">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="mob-notes-search-icon"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="mob-notes-search-input"
          placeholder="Search sheets, people, courses..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="mob-search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="mob-notes-skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="mob-notes-skeleton-card" />
          ))}
        </div>
      ) : error ? (
        <div className="mob-feed-empty">
          <p className="mob-feed-empty-text">Search failed. Try again.</p>
        </div>
      ) : !query || query.length < 2 ? (
        <div className="mob-search-hint">
          <p>Type at least 2 characters to search.</p>
        </div>
      ) : !hasResults ? (
        <div className="mob-feed-empty">
          <h3 className="mob-feed-empty-title">No results</h3>
          <p className="mob-feed-empty-text">Try a different search term.</p>
        </div>
      ) : (
        <div ref={resultsRef} className="mob-search-results">
          <ResultSection
            title="Sheets"
            items={results.sheets}
            renderItem={(s) => (
              <button
                key={s.id}
                type="button"
                className="mob-search-item"
                onClick={() => goSheet(s.id)}
              >
                <span className="mob-search-item-title">{s.title}</span>
                <span className="mob-search-item-sub">{s.author?.username || ''}</span>
              </button>
            )}
          />
          <ResultSection
            title="People"
            items={results.users}
            renderItem={(u) => (
              <button
                key={u.id}
                type="button"
                className="mob-search-item"
                onClick={() => goUser(u.id)}
              >
                <span className="mob-search-item-title">@{u.username}</span>
                <span className="mob-search-item-sub">{u.displayName || ''}</span>
              </button>
            )}
          />
          <ResultSection
            title="Notes"
            items={results.notes}
            renderItem={(n) => (
              <button
                key={n.id}
                type="button"
                className="mob-search-item"
                onClick={() => goNote(n.id)}
              >
                <span className="mob-search-item-title">{n.title || 'Untitled'}</span>
                <span className="mob-search-item-sub">{n.author?.username || ''}</span>
              </button>
            )}
          />
          <ResultSection
            title="Study Groups"
            items={results.groups}
            renderItem={(g) => (
              <button
                key={g.id}
                type="button"
                className="mob-search-item"
                onClick={() => goGroup(g.id)}
              >
                <span className="mob-search-item-title">{g.name}</span>
                <span className="mob-search-item-sub">{g.memberCount || 0} members</span>
              </button>
            )}
          />
        </div>
      )}
    </div>
  )
}
