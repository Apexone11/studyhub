/**
 * ScholarSearchPage.jsx — Results page at `/scholar/search`.
 *
 * URL-driven (?q, ?sort, ?yearFrom, ?yearTo, ?openAccess). Renders a
 * paper-card list down the middle and a sticky right-rail filter
 * panel on ≥1280px.
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'
import { API } from '../../config'
import PaperCard from './paperCard/PaperCard'
import ScholarShell from './ScholarShell'
import './ScholarPage.css'

export default function ScholarSearchPage() {
  usePageTitle('Scholar search')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') || ''
  const yearFrom = params.get('yearFrom') || ''
  const yearTo = params.get('yearTo') || ''
  const openAccess = params.get('openAccess') === '1'
  const hasPdf = params.get('hasPdf') === '1'
  const sources = params.get('sources') || ''
  const domains = params.get('domains') || ''
  const sort = params.get('sort') || ''
  const minCitations = params.get('minCitations') || ''
  const author = params.get('author') || ''
  const venue = params.get('venue') || ''
  const [searchInput, setSearchInput] = useState(q)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [throttled, setThrottled] = useState([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(q)
  }, [q])

  useEffect(() => {
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      setError(null)
      return
    }
    let aborted = false
    setLoading(true)
    setError(null)
    const url = new URL(`${API}/api/scholar/search`)
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '20')
    if (yearFrom) url.searchParams.set('yearFrom', yearFrom)
    if (yearTo) url.searchParams.set('yearTo', yearTo)
    if (openAccess) url.searchParams.set('openAccess', '1')
    if (hasPdf) url.searchParams.set('hasPdf', '1')
    if (sources) url.searchParams.set('sources', sources)
    if (domains) url.searchParams.set('domains', domains)
    if (sort) url.searchParams.set('sort', sort)
    if (minCitations) url.searchParams.set('minCitations', minCitations)
    if (author) url.searchParams.set('author', author)
    if (venue) url.searchParams.set('venue', venue)
    fetch(url.toString(), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Search failed (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (aborted) return
        const list = Array.isArray(json.results) ? json.results : []
        setResults(list)
        setThrottled(Array.isArray(json.throttledSources) ? json.throttledSources : [])
      })
      .catch((err) => {
        if (!aborted) setError(err.message || 'Search failed')
      })
      .finally(() => {
        if (!aborted) setLoading(false)
      })
    return () => {
      aborted = true
    }
  }, [q, yearFrom, yearTo, openAccess, hasPdf, sources, domains, sort, minCitations, author, venue])

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault()
      const next = searchInput.trim()
      if (!next) return
      navigate(`/scholar/search?q=${encodeURIComponent(next)}`)
    },
    [navigate, searchInput],
  )

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value === null || value === '' || value === false) next.delete(key)
    else next.set(key, value === true ? '1' : value)
    setParams(next, { replace: true })
  }

  return (
    <ScholarShell mainId="scholar-search-main">
      <div className="scholar-shell" style={{ paddingTop: 0 }}>
        <form className="scholar-hero__search" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="scholar-search-box">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search Scholar"
              aria-label="Search Scholar"
            />
          </div>
          <button type="submit" className="scholar-filters-btn">
            Search
          </button>
        </form>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 32,
          }}
        >
          <section aria-label="Search results">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 16,
              }}
            >
              <h1
                style={{
                  fontFamily: 'var(--font-paper)',
                  fontSize: 'var(--type-lg)',
                  margin: 0,
                  color: 'var(--sh-heading)',
                }}
              >
                {q ? `Results for "${q}"` : 'Search Scholar'}
              </h1>
              {throttled.length > 0 && (
                <span
                  style={{
                    fontSize: 'var(--type-xs)',
                    color: 'var(--sh-warning-text)',
                    background: 'var(--sh-warning-bg)',
                    padding: '4px 10px',
                    borderRadius: 999,
                  }}
                >
                  {throttled.join(', ')} throttled
                </span>
              )}
            </div>
            {loading && <div style={{ color: 'var(--sh-subtext)' }}>Searching…</div>}
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
            {!loading && !error && q && results.length === 0 && (
              <div style={{ color: 'var(--sh-subtext)' }}>
                No results found. Try different keywords.
              </div>
            )}
            <div className="paper-card-grid paper-card-grid--list">
              {results.map((paper) => (
                <PaperCard key={paper.id} paper={paper} variant="full" />
              ))}
            </div>
          </section>

          <aside
            aria-label="Filters"
            style={{
              alignSelf: 'start',
              position: 'sticky',
              top: 80,
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-paper)',
                fontSize: 'var(--type-md)',
                color: 'var(--sh-heading)',
                margin: '0 0 12px',
              }}
            >
              Filters
            </h2>
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 12,
                fontSize: 'var(--type-sm)',
                color: 'var(--sh-text)',
              }}
            >
              <input
                type="checkbox"
                checked={openAccess}
                onChange={(e) => setFilter('openAccess', e.target.checked)}
              />
              Open access only
            </label>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--type-xs)',
                color: 'var(--sh-subtext)',
                marginBottom: 4,
              }}
            >
              From year
            </label>
            <input
              type="number"
              value={yearFrom}
              min="1900"
              max="2100"
              onChange={(e) => setFilter('yearFrom', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--sh-surface)',
                border: '1px solid var(--sh-border)',
                borderRadius: 8,
                marginBottom: 12,
                color: 'var(--sh-text)',
                fontFamily: 'inherit',
              }}
            />
            <label
              style={{
                display: 'block',
                fontSize: 'var(--type-xs)',
                color: 'var(--sh-subtext)',
                marginBottom: 4,
              }}
            >
              To year
            </label>
            <input
              type="number"
              value={yearTo}
              min="1900"
              max="2100"
              onChange={(e) => setFilter('yearTo', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--sh-surface)',
                border: '1px solid var(--sh-border)',
                borderRadius: 8,
                color: 'var(--sh-text)',
                fontFamily: 'inherit',
              }}
            />
            <Link
              to="/scholar"
              style={{
                display: 'block',
                marginTop: 16,
                fontSize: 'var(--type-sm)',
                color: 'var(--sh-brand)',
                textDecoration: 'none',
              }}
            >
              ← Back to Scholar landing
            </Link>
          </aside>
        </div>
      </div>
    </ScholarShell>
  )
}
