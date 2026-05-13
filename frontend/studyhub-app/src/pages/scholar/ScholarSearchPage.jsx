/**
 * ScholarSearchPage.jsx — Primary user journey for finding papers.
 *
 * StudyHub-native chrome (Plus Jakarta Sans, blue accent, warm page bg)
 * — NOT editorial serif. URL is the source of truth for all filters,
 * mirroring the /sheets page convention.
 *
 * URL params (read + written):
 *   q, source, yearFrom, yearTo, openAccess, sort, hasPdf, compare
 * URL params (read-only, for backward compat with older deep-links):
 *   year_from, year_to, open_access, sources (csv, written by drawer)
 *
 * Why both naming styles: the design brief lists snake_case (?year_from=)
 * but the existing ScholarFiltersDrawer (owned by another agent) writes
 * camelCase (yearFrom, openAccess) and the backend reads camelCase. We
 * accept both on read, write camelCase on filter changes so this page
 * stays interoperable with the drawer and the backend without forcing
 * a coordinated migration across files we don't own.
 *
 * Features:
 *  - Sticky top search bar, live-debounced (300ms)
 *  - Cmd/Ctrl+K and "/" focus the search input
 *  - Horizontal filter chip strip (NOT a side drawer on desktop)
 *  - Mobile "Filters" chip opens ScholarFiltersDrawer
 *  - 1-col mobile / 2-col tablet+ result grid via PaperCard
 *  - Infinite scroll with sessionStorage position restore
 *  - Empty state with 6 example queries
 *  - No-results suggestions + arXiv direct-search link for ID-like queries
 *  - Result count + duration above the grid
 *  - Compare mode (max 4 papers) → ?compare=id1,id2 deep link
 *  - "Why this paper?" tooltip pulling from result._meta
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'
import { API } from '../../config'
import PaperCard from './paperCard/PaperCard'
import ScholarShell from './ScholarShell'
import ScholarFiltersDrawer from './ScholarFiltersDrawer'
import useScholarShortcuts from './shortcuts/useScholarShortcuts'
import ScholarKeyboardShortcutsModal, {
  ScholarShortcutsHint,
} from './shortcuts/ScholarKeyboardShortcutsModal'
import { useResponsiveAppLayout } from '../../lib/ui'
import { SCHOLAR_SOURCES, SCHOLAR_SORTS } from './scholarConstants'
import './ScholarPage.css'
import './ScholarSearchPage.css'

const DEBOUNCE_MS = 300
const PAGE_SIZE = 20
const COMPARE_MAX = 4
const SS_KEY_PREFIX = 'scholar.search.scroll:'

const EXAMPLE_QUERIES = [
  'attention is all you need',
  'DNA replication',
  'Pareto efficiency',
  'transformer architecture',
  'CRISPR gene editing',
  'climate sensitivity',
]

// arXiv IDs come in two shapes: classic (cs.LG/0501001) and new (1706.03762).
const ARXIV_ID_RE = /^(arxiv:)?(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})/i

// Snake-case reader fallback so a ?year_from= deep-link still works even
// though we write yearFrom internally.
function readParam(params, primary, legacy) {
  const v = params.get(primary)
  if (v !== null && v !== '') return v
  if (legacy) return params.get(legacy) || ''
  return ''
}

function readBoolParam(params, primary, legacy) {
  const raw = readParam(params, primary, legacy)
  return raw === '1' || raw === 'true'
}

function buildSessionKey(filters) {
  return (
    SS_KEY_PREFIX +
    [filters.q, filters.source, filters.yearFrom, filters.yearTo, filters.openAccess ? '1' : '0']
      .map((s) => String(s || ''))
      .join('|')
  )
}

function ResultSkeleton() {
  return (
    <div className="scholar-search-page__skeleton" aria-hidden="true">
      <div className="scholar-search-page__skeleton-bar" style={{ width: '40%', height: 10 }} />
      <div className="scholar-search-page__skeleton-bar" style={{ width: '90%', height: 18 }} />
      <div className="scholar-search-page__skeleton-bar" style={{ width: '70%', height: 12 }} />
      <div className="scholar-search-page__skeleton-bar" style={{ width: '100%', height: 12 }} />
      <div className="scholar-search-page__skeleton-bar" style={{ width: '85%', height: 12 }} />
    </div>
  )
}

function deriveWhyText(meta) {
  if (!meta || typeof meta !== 'object') return ''
  const field = meta.field || meta.matchField
  const term = meta.keyword || meta.term || meta.stem
  const rank = typeof meta.citationRank === 'number' ? meta.citationRank : null
  const bits = []
  if (field && term) bits.push(`Matched "${term}" in ${field}.`)
  else if (field) bits.push(`Matched in ${field}.`)
  else if (term) bits.push(`Matched "${term}".`)
  if (rank !== null) bits.push(`Citation-weight rank ${rank}.`)
  return bits.join(' ')
}

function WhyPaperTooltip({ meta }) {
  const [open, setOpen] = useState(false)
  const text = deriveWhyText(meta)
  if (!text) return null
  return (
    <div
      className="scholar-search-page__why"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="scholar-search-page__why-btn"
        aria-label="Why this paper?"
        aria-describedby={open ? 'scholar-why-pop' : undefined}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ?
      </button>
      {open ? (
        <div id="scholar-why-pop" role="tooltip" className="scholar-search-page__why-pop">
          {text}
        </div>
      ) : null}
    </div>
  )
}

export default function ScholarSearchPage() {
  usePageTitle('Scholar search')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const layout = useResponsiveAppLayout()

  // Read URL params (camelCase preferred, snake_case fallback for deep-links).
  const q = readParam(params, 'q')
  const source = readParam(params, 'source', 'sources')
  const yearFrom = readParam(params, 'yearFrom', 'year_from')
  const yearTo = readParam(params, 'yearTo', 'year_to')
  const openAccess = readBoolParam(params, 'openAccess', 'open_access')
  const sort = readParam(params, 'sort') || 'relevance'
  const compareRaw = readParam(params, 'compare')

  // ── Search input (debounced into ?q=) ──────────────────────────────
  const [searchInput, setSearchInput] = useState(q)
  const inputRef = useRef(null)

  // Sync external URL changes back into the controlled input (e.g. when
  // an example-query button writes ?q=).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(q)
  }, [q])

  // Debounced commit: pushes searchInput into the URL after DEBOUNCE_MS.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === q) return undefined
    const t = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (trimmed) next.set('q', trimmed)
      else next.delete('q')
      setParams(next, { replace: true })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput, q, params, setParams])

  // Cmd/Ctrl+K and "/" focus the input (Gmail/Linear convention).
  useEffect(() => {
    function onKey(e) {
      const isMod = e.metaKey || e.ctrlKey
      const tag = (e.target?.tagName || '').toLowerCase()
      const typingInForm =
        tag === 'input' || tag === 'textarea' || e.target?.isContentEditable === true
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select?.()
        return
      }
      if (e.key === '/' && !typingInForm) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Filter writers ─────────────────────────────────────────────────
  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params)
      if (value === null || value === '' || value === false) next.delete(key)
      else next.set(key, value === true ? '1' : String(value))
      // Compare set is invalidated whenever filters change, so the
      // selection doesn't span unrelated result lists.
      next.delete('compare')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const clearAllFilters = useCallback(() => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    setParams(next, { replace: true })
  }, [q, setParams])

  // ── Search effect (with debounce, AbortController, pagination) ─────
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [throttled, setThrottled] = useState([])
  const [duration, setDuration] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)

  // Reset pagination + results when the query/filter signature changes.
  const filterSignature = `${q}|${source}|${yearFrom}|${yearTo}|${openAccess ? '1' : '0'}|${sort}`
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLimit(PAGE_SIZE)
    setResults([])
    setHasMore(false)
    setError(null)
  }, [filterSignature])

  useEffect(() => {
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      setError(null)
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const isInitial = limit === PAGE_SIZE
    if (isInitial) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const url = new URL(`${API}/api/scholar/search`)
    url.searchParams.set('q', q)
    url.searchParams.set('limit', String(limit))
    if (yearFrom) url.searchParams.set('yearFrom', yearFrom)
    if (yearTo) url.searchParams.set('yearTo', yearTo)
    if (openAccess) url.searchParams.set('openAccess', '1')
    if (source) url.searchParams.set('sources', source)
    if (sort && sort !== 'relevance') url.searchParams.set('sort', sort)

    const started = performance.now()
    fetch(url.toString(), { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          // Backend may not be wired yet in dev — surface a graceful
          // message rather than blowing up the UI.
          throw new Error(`Search failed (${res.status})`)
        }
        return res.json()
      })
      .then((json) => {
        const list = Array.isArray(json.results) ? json.results : []
        setResults(list)
        setThrottled(Array.isArray(json.throttledSources) ? json.throttledSources : [])
        // Backend caps internally at 50; if we got back exactly `limit`
        // items there's probably more to fetch.
        setHasMore(list.length >= limit && limit < 50)
        setDuration(Math.round(performance.now() - started))
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Search failed')
        setResults([])
        setHasMore(false)
      })
      .finally(() => {
        setLoading(false)
        setLoadingMore(false)
      })

    return () => controller.abort()
    // `limit` is included so paging fetches a larger window.
  }, [q, source, yearFrom, yearTo, openAccess, sort, limit])

  // ── Infinite scroll sentinel ───────────────────────────────────────
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loading || loadingMore) return undefined
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (e && e.isIntersecting) {
          setLimit((prev) => Math.min(50, prev + PAGE_SIZE))
        }
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, loadingMore])

  // ── Scroll position restore ────────────────────────────────────────
  const restoreKey = useMemo(
    () => buildSessionKey({ q, source, yearFrom, yearTo, openAccess }),
    [q, source, yearFrom, yearTo, openAccess],
  )

  // Restore once results have rendered for this signature.
  const restoredRef = useRef(false)
  useEffect(() => {
    restoredRef.current = false
  }, [restoreKey])

  useEffect(() => {
    if (restoredRef.current || results.length === 0) return
    try {
      const stored = sessionStorage.getItem(restoreKey)
      if (stored) {
        const y = Number.parseInt(stored, 10)
        if (Number.isInteger(y) && y > 0) {
          window.scrollTo({ top: y, behavior: 'auto' })
        }
      }
    } catch {
      // sessionStorage may throw in private mode — best-effort only.
    }
    restoredRef.current = true
  }, [restoreKey, results.length])

  // Save scroll on unmount / signature change.
  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem(restoreKey, String(Math.round(window.scrollY || 0)))
      } catch {
        // ignore
      }
    }
  }, [restoreKey])

  // ── Compare set ────────────────────────────────────────────────────
  const compareIds = useMemo(() => {
    if (!compareRaw) return []
    return compareRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, COMPARE_MAX)
  }, [compareRaw])

  const toggleCompare = useCallback(
    (id) => {
      if (!id) return
      const set = new Set(compareIds)
      if (set.has(id)) set.delete(id)
      else if (set.size < COMPARE_MAX) set.add(id)
      const next = new URLSearchParams(params)
      const ids = [...set]
      if (ids.length > 0) next.set('compare', ids.join(','))
      else next.delete('compare')
      setParams(next, { replace: true })
    },
    [compareIds, params, setParams],
  )

  const clearCompare = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('compare')
    setParams(next, { replace: true })
  }, [params, setParams])

  const goToCompare = useCallback(() => {
    if (compareIds.length < 2) return
    // Future iteration: render a side-by-side compare table. For now we
    // simply land the user back on the search URL with the compare set
    // preserved so a follow-up agent can wire the table.
    navigate(`/scholar/search?q=${encodeURIComponent(q)}&compare=${compareIds.join(',')}`)
  }, [compareIds, navigate, q])

  // ── Drawer (mobile) ────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerTriggerRef = useRef(null)

  // ── Keyboard shortcuts (wave-7 wiring 2026-05-13) ──────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  useScholarShortcuts({
    onShowHelp: () => setShortcutsOpen(true),
    onFocusSearch: () => {
      inputRef.current?.focus()
      inputRef.current?.select?.()
    },
    onCloseOverlay: () => {
      if (drawerOpen) setDrawerOpen(false)
      else if (shortcutsOpen) setShortcutsOpen(false)
    },
  })

  // ── Render helpers ─────────────────────────────────────────────────
  const arxivLikely = q && ARXIV_ID_RE.test(q.trim())
  const gridCols = layout.isPhone ? 1 : 2

  return (
    <ScholarShell mainId="scholar-search-main">
      <div className="scholar-search-page">
        {/* Sticky top search bar */}
        <div className="scholar-search-page__sticky-bar">
          <div className="scholar-search-page__bar">
            <div className="scholar-search-page__input-wrap">
              <svg
                className="scholar-search-page__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                className="scholar-search-page__input"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search papers, authors, DOIs"
                aria-label="Search Scholar"
                autoComplete="off"
                enterKeyHint="search"
              />
              {searchInput ? (
                <button
                  type="button"
                  className="scholar-search-page__clear-btn"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              ) : (
                <span className="scholar-search-page__kbd" aria-hidden="true">
                  /
                </span>
              )}
            </div>
          </div>

          {/* Filter chip strip */}
          <div className="scholar-search-page__filters" role="group" aria-label="Filters">
            {layout.isPhone ? (
              <button
                type="button"
                ref={drawerTriggerRef}
                className="scholar-search-page__chip"
                onClick={() => setDrawerOpen(true)}
              >
                Filters
              </button>
            ) : (
              <>
                {!source &&
                  !yearFrom &&
                  !yearTo &&
                  !openAccess &&
                  (!sort || sort === 'relevance') && (
                    <span className="scholar-search-page__filters-hint" aria-hidden="true">
                      Refine results
                    </span>
                  )}
                <button
                  type="button"
                  className="scholar-search-page__chip"
                  aria-pressed={openAccess}
                  onClick={() => setFilter('openAccess', !openAccess)}
                >
                  Open access
                </button>
                <select
                  className="scholar-search-page__chip-select"
                  value={source}
                  onChange={(e) => setFilter('source', e.target.value)}
                  aria-label="Source"
                >
                  <option value="">All sources</option>
                  {SCHOLAR_SOURCES.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  className="scholar-search-page__chip-select"
                  value={sort}
                  onChange={(e) => setFilter('sort', e.target.value)}
                  aria-label="Sort by"
                >
                  {SCHOLAR_SORTS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="scholar-search-page__chip-select"
                  placeholder="Year from"
                  value={yearFrom}
                  min="1900"
                  max="2100"
                  onChange={(e) => setFilter('yearFrom', e.target.value)}
                  style={{ width: 110 }}
                  aria-label="Year from"
                />
                <input
                  type="number"
                  className="scholar-search-page__chip-select"
                  placeholder="Year to"
                  value={yearTo}
                  min="1900"
                  max="2100"
                  onChange={(e) => setFilter('yearTo', e.target.value)}
                  style={{ width: 110 }}
                  aria-label="Year to"
                />
                <button
                  type="button"
                  className="scholar-search-page__chip"
                  ref={drawerTriggerRef}
                  onClick={() => setDrawerOpen(true)}
                >
                  More filters
                </button>
                {(source || yearFrom || yearTo || openAccess || (sort && sort !== 'relevance')) && (
                  <button
                    type="button"
                    className="scholar-search-page__chip-clear"
                    onClick={clearAllFilters}
                  >
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Result count + duration + throttled banner */}
        {q && !loading && !error && results.length > 0 && (
          <div className="scholar-search-page__meta">
            <span className="scholar-search-page__meta-spacer" aria-hidden="true" />
            {throttled.length > 0 && (
              <span className="scholar-search-page__throttled">
                {throttled.join(', ')} throttled
              </span>
            )}
            <span
              className="scholar-search-page__meta-chip"
              aria-label={`${results.length} result${results.length === 1 ? '' : 's'}${duration ? `, ${duration} milliseconds` : ''}`}
            >
              {results.length.toLocaleString()} result{results.length === 1 ? '' : 's'}
              {duration ? ` · ${duration}ms` : ''}
            </span>
          </div>
        )}

        {/* Error banner */}
        {error && <div className="scholar-search-page__error">{error}</div>}

        {/* Empty state (no query) */}
        {!q && (
          <div className="scholar-search-page__empty">
            <h1 className="scholar-search-page__empty-title">Search 200M+ academic papers</h1>
            <p className="scholar-search-page__empty-sub">
              Try one of these to get started, or press / to start typing.
            </p>
            <div className="scholar-search-page__example-grid">
              {EXAMPLE_QUERIES.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className="scholar-search-page__example"
                  onClick={() => {
                    setSearchInput(sample)
                    const next = new URLSearchParams(params)
                    next.set('q', sample)
                    setParams(next, { replace: true })
                  }}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* First-load skeleton */}
        {q && loading && (
          <div
            className={`scholar-search-page__grid${gridCols === 2 ? ' scholar-search-page__grid--two' : ''}`}
          >
            {Array.from({ length: gridCols * 3 }).map((_, i) => (
              <ResultSkeleton key={i} />
            ))}
          </div>
        )}

        {/* No results state */}
        {q && !loading && !error && results.length === 0 && (
          <div className="scholar-search-page__empty">
            <h2 className="scholar-search-page__empty-title">No matches for &ldquo;{q}&rdquo;</h2>
            <p className="scholar-search-page__empty-sub">
              We searched 4 academic indexes and came up empty.
            </p>
            <div className="scholar-search-page__suggestions">
              {(yearFrom || yearTo) && (
                <span>
                  Try{' '}
                  <button
                    type="button"
                    className="scholar-search-page__chip-clear"
                    onClick={() => {
                      setFilter('yearFrom', '')
                      setFilter('yearTo', '')
                    }}
                    style={{ padding: 0 }}
                  >
                    removing the year filter
                  </button>
                  .
                </span>
              )}
              <span>Try broader search terms or check spelling.</span>
              {arxivLikely && (
                <a
                  href={`https://arxiv.org/abs/${encodeURIComponent(q.replace(/^arxiv:/i, ''))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Search this ID directly on arXiv →
                </a>
              )}
            </div>
          </div>
        )}

        {/* Results grid */}
        {q && !loading && !error && results.length > 0 && (
          <>
            <div
              className={`scholar-search-page__grid${gridCols === 2 ? ' scholar-search-page__grid--two' : ''}`}
            >
              {results.map((paper) => {
                const selected = compareIds.includes(paper.id)
                const compareDisabled = !selected && compareIds.length >= COMPARE_MAX
                return (
                  <div key={paper.id} className="scholar-search-page__card-wrap">
                    <button
                      type="button"
                      className="scholar-search-page__compare-toggle"
                      aria-pressed={selected}
                      aria-label={selected ? 'Remove from compare' : 'Add to compare'}
                      disabled={compareDisabled}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleCompare(paper.id)
                      }}
                    >
                      {selected ? '✓ Compare' : 'Compare'}
                    </button>
                    <PaperCard paper={paper} variant="full" />
                    <WhyPaperTooltip meta={paper._meta} />
                  </div>
                )
              })}
            </div>

            {/* Infinite-scroll sentinel + end-of-results marker */}
            {hasMore && (
              <div ref={sentinelRef} className="scholar-search-page__sentinel" aria-live="polite">
                {loadingMore ? 'Loading more…' : ' '}
              </div>
            )}
            {!hasMore && results.length >= PAGE_SIZE && (
              <div className="scholar-search-page__end">You&rsquo;ve reached the end.</div>
            )}
          </>
        )}

        {/* Compare banner (when ≥1 selected) */}
        {compareIds.length > 0 && (
          <div
            className="scholar-search-page__compare-bar"
            role="region"
            aria-label="Compare selection"
          >
            <span className="scholar-search-page__compare-bar-count">
              {compareIds.length} of {COMPARE_MAX} selected
            </span>
            <span className="scholar-search-page__compare-bar-spacer" />
            <button
              type="button"
              className="scholar-search-page__compare-clear"
              onClick={clearCompare}
              aria-label="Clear compare selection"
            >
              Clear selection
            </button>
            <button
              type="button"
              className="scholar-search-page__compare-go"
              onClick={goToCompare}
              disabled={compareIds.length < 2}
            >
              Compare side-by-side
            </button>
          </div>
        )}
      </div>

      <ScholarFiltersDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        returnFocusRef={drawerTriggerRef}
      />

      <ScholarKeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ScholarShortcutsHint onOpen={() => setShortcutsOpen(true)} />
    </ScholarShell>
  )
}
