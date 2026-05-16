/**
 * ScholarSavedPage.jsx — `/scholar/saved` and `/scholar/shelf/:id`.
 *
 * Saved papers + shelves browser. Two-column shell on desktop (rail + grid),
 * collapses to a horizontal chip strip on phone/tablet. Bulk-action bar
 * surfaces when ≥1 card is selected.
 *
 * Data sources, in order of preference:
 *   1) `GET /api/scholar/saved?shelfId=&sort=&filter=` (preferred; 404-safe).
 *   2) Falls back to `GET /api/library/shelves?includeBooks=true` and filters
 *      rows by `sourceType === 'paper'`. This is the path that currently
 *      ships in prod — Scholar paper saves live in `ShelfBook` next to books.
 *
 * The page never hard-fails on 404 — empty array fallback per brief.
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'
import useFetch from '../../lib/useFetch'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import ScholarShell from './ScholarShell'
import './ScholarPage.css'
import './ScholarLists.css'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Newest saved' },
  { value: 'title', label: 'Title (A→Z)' },
  { value: 'author', label: 'First author' },
  { value: 'year', label: 'Year (newest first)' },
  { value: 'citations', label: 'Citation count' },
]

const SR_ONLY_STYLE = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read' },
  { value: 'unread', label: 'Unread' },
  { value: 'with-annotations', label: 'With annotations' },
  { value: 'without-annotations', label: 'Without annotations' },
  { value: 'my-notes', label: 'My notes only' },
]

function getYear(value) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return 0
  return new Date(ts).getUTCFullYear()
}

function firstAuthor(row) {
  if (Array.isArray(row.authors) && row.authors.length > 0) {
    const a = row.authors[0]
    return (typeof a === 'string' ? a : a?.name || '').toLowerCase()
  }
  return (row.author || '').toLowerCase()
}

/**
 * Normalize either the preferred `/api/scholar/saved` response shape
 * (`{ items: [{ id, paperId, title, authors, year, ... }] }`) or the
 * library shelves payload (`{ shelves: [{ id, name, books: [...] }] }`)
 * into a flat list of saved-paper rows the rest of the page consumes.
 */
function normalizeSaved(payload) {
  if (!payload) return { rows: [], shelves: [] }

  // Preferred shape from /api/scholar/saved (graceful no-op if absent).
  if (Array.isArray(payload.items)) {
    return {
      rows: payload.items.map((it) => ({
        id: it.id ?? it.paperId ?? it.title,
        paperId: it.paperId,
        title: it.title || 'Untitled',
        authors: it.authors || [],
        author: Array.isArray(it.authors) ? (it.authors[0]?.name ?? '') : (it.author ?? ''),
        venue: it.venue || '',
        year: it.year ?? getYear(it.publishedAt),
        publishedAt: it.publishedAt || null,
        citationCount: it.citationCount ?? 0,
        addedAt: it.savedAt ?? it.addedAt ?? null,
        isRead: !!it.isRead,
        annotationCount: it.annotationCount ?? 0,
        hasNotes: !!it.hasNotes,
        shelfId: it.shelfId ?? null,
        shelfName: it.shelfName ?? '',
      })),
      shelves: Array.isArray(payload.shelves) ? payload.shelves : [],
    }
  }

  // Library shelves fallback.
  if (Array.isArray(payload.shelves)) {
    const rows = []
    for (const shelf of payload.shelves) {
      const books = Array.isArray(shelf.books) ? shelf.books : []
      for (const b of books) {
        if (b.sourceType !== 'paper') continue
        rows.push({
          id: `${shelf.id}-${b.id}`,
          paperId: b.paperId || b.volumeId,
          title: b.title || 'Untitled',
          authors: b.author ? [{ name: b.author }] : [],
          author: b.author || '',
          venue: '',
          year: getYear(b.publishedAt),
          publishedAt: b.publishedAt || null,
          citationCount: 0,
          addedAt: b.addedAt || null,
          isRead: !!b.read,
          annotationCount: b.annotationCount ?? 0,
          hasNotes: !!b.notes,
          shelfId: shelf.id,
          shelfName: shelf.name || '',
        })
      }
    }
    return { rows, shelves: payload.shelves }
  }

  return { rows: [], shelves: [] }
}

function applySort(rows, sort) {
  const copy = rows.slice()
  switch (sort) {
    case 'title':
      copy.sort((a, b) => a.title.localeCompare(b.title))
      break
    case 'author':
      copy.sort((a, b) => firstAuthor(a).localeCompare(firstAuthor(b)))
      break
    case 'year':
      copy.sort((a, b) => (b.year || 0) - (a.year || 0))
      break
    case 'citations':
      copy.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0))
      break
    case 'recent':
    default: {
      const t = (r) => (r.addedAt ? new Date(r.addedAt).getTime() : 0)
      copy.sort((a, b) => t(b) - t(a))
      break
    }
  }
  return copy
}

function applyFilter(rows, filter) {
  switch (filter) {
    case 'read':
      return rows.filter((r) => r.isRead)
    case 'unread':
      return rows.filter((r) => !r.isRead)
    case 'with-annotations':
      return rows.filter((r) => (r.annotationCount || 0) > 0)
    case 'without-annotations':
      return rows.filter((r) => (r.annotationCount || 0) === 0)
    case 'my-notes':
      return rows.filter((r) => r.hasNotes)
    case 'all':
    default:
      return rows
  }
}

function SkeletonGrid() {
  return (
    <div className="scholar-list__grid" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="scholar-list__skeleton-card">
          <div className="scholar-list__skeleton-line scholar-list__skeleton-line--title" />
          <div className="scholar-list__skeleton-line scholar-list__skeleton-line--meta" />
          <div className="scholar-list__skeleton-line scholar-list__skeleton-line--abstract" />
        </div>
      ))}
    </div>
  )
}

export default function ScholarSavedPage() {
  usePageTitle('Saved papers')
  const navigate = useNavigate()
  const { id: shelfIdParam } = useParams()

  const initialShelfId = shelfIdParam ? Number.parseInt(shelfIdParam, 10) : null
  const activeShelfId =
    Number.isInteger(initialShelfId) && initialShelfId > 0 ? initialShelfId : null

  const [sort, setSort] = useState('recent')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [creatingShelf, setCreatingShelf] = useState(false)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)

  // Build the query string for the preferred endpoint so SWR caches per
  // (shelf|sort|filter) tuple. Falls back gracefully on 404.
  const savedQuery = useMemo(() => {
    const qs = new URLSearchParams()
    if (activeShelfId) qs.set('shelfId', String(activeShelfId))
    qs.set('sort', sort)
    qs.set('filter', filter)
    return qs.toString()
  }, [activeShelfId, sort, filter])

  // Try the preferred endpoint first. `useFetch` surfaces non-2xx as an
  // error — we treat a 404 here as "endpoint not built yet" and let the
  // fallback hook below take over.
  const {
    data: scholarSavedData,
    error: scholarSavedError,
    refetch: refetchScholarSaved,
  } = useFetch(`/api/scholar/saved?${savedQuery}`, {
    swr: 30000,
    cacheKey: `scholar-saved:${savedQuery}`,
  })

  // Fallback to library shelves (current prod source). Always requested so
  // we can populate the shelf rail even when the preferred endpoint exists.
  const {
    data: shelvesData,
    loading: shelvesLoading,
    refetch: refetchShelves,
  } = useFetch('/api/library/shelves?includeBooks=true', {
    swr: 30000,
    cacheKey: 'scholar-saved:shelves',
  })

  // Resolve which data source feeds the grid.
  // Preferred response wins. If it errored (404 / 5xx), fall back to shelves.
  const source = useMemo(() => {
    if (scholarSavedData && !scholarSavedError) return normalizeSaved(scholarSavedData)
    return normalizeSaved(shelvesData)
  }, [scholarSavedData, scholarSavedError, shelvesData])

  const allRows = source.rows
  const shelves = source.shelves

  // Local sort/filter when the fallback path is in use (the preferred
  // endpoint already returns sorted/filtered data). Cheap on small N.
  const visibleRows = useMemo(() => {
    const scoped = activeShelfId ? allRows.filter((r) => r.shelfId === activeShelfId) : allRows
    return applySort(applyFilter(scoped, filter), sort)
  }, [allRows, activeShelfId, filter, sort])

  // Per-shelf counts for the rail. Always computed against the unfiltered
  // row set so the count reflects total saved, not the filtered view.
  const shelfCounts = useMemo(() => {
    const map = new Map()
    for (const r of allRows) {
      if (!r.shelfId) continue
      map.set(r.shelfId, (map.get(r.shelfId) || 0) + 1)
    }
    return map
  }, [allRows])

  const unreadCount = useMemo(() => allRows.filter((r) => !r.isRead).length, [allRows])
  // `pageMountTime` is captured once at first render via a lazy-state
  // initializer so the recent-count cutoff is deterministic across
  // re-renders (avoids calling `Date.now()` in the render body, which
  // the React Compiler purity rule rejects).
  const [pageMountTime] = useState(() => Date.now())
  const recentCount = useMemo(() => {
    const cutoff = pageMountTime - 7 * 24 * 60 * 60 * 1000
    return allRows.filter((r) => r.addedAt && new Date(r.addedAt).getTime() >= cutoff).length
  }, [allRows, pageMountTime])

  const loading = !scholarSavedData && shelvesLoading
  const hasError = scholarSavedError && !shelvesData

  const goToShelf = useCallback(
    (id) => {
      // Defer the navigation to next microtask so this can't fire inside
      // a render path (React Compiler set-state-in-effect lint).
      Promise.resolve().then(() => {
        if (id == null) navigate('/scholar/saved')
        else navigate(`/scholar/shelf/${id}`)
      })
    },
    [navigate],
  )

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const handleCreateShelf = useCallback(async () => {
    const name = window.prompt('Name your new shelf')
    if (!name || !name.trim()) return
    setCreatingShelf(true)
    try {
      // Prefer the new endpoint; fall back to library shelves which is the
      // current prod path.
      let res = await fetch(`${API}/api/scholar/shelves`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim() }),
      })
      if (res.status === 404) {
        res = await fetch(`${API}/api/library/shelves`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({ name: name.trim() }),
        })
      }
      if (!res.ok) throw new Error(`Could not create shelf (${res.status})`)
      showToast('Shelf created.', 'success')
      refetchShelves()
      refetchScholarSaved()
    } catch (err) {
      showToast(err.message || 'Could not create shelf', 'error')
    } finally {
      setCreatingShelf(false)
    }
  }, [refetchShelves, refetchScholarSaved])

  // Split open-confirm from really-do-it so the destructive action gets a
  // portaled focus-trapped ConfirmDialog instead of the raw window.confirm
  // (which can't be styled, traps focus poorly, and doesn't match the
  // rest of the app's modals).
  const handleBulkRemove = useCallback(() => {
    if (selected.size === 0) return
    setBulkRemoveOpen(true)
  }, [selected])

  const confirmBulkRemove = useCallback(async () => {
    setBulkRemoveOpen(false)
    const ids = [...selected]
    let okCount = 0
    for (const id of ids) {
      const row = allRows.find((r) => r.id === id)
      if (!row?.paperId) continue
      try {
        // Prefer the canonical scholar endpoint; fall back to library
        // (where ShelfBook lives today). Either succeeding counts as ok.
        let res = await fetch(`${API}/api/scholar/saved/${encodeURIComponent(row.paperId)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        })
        if (res.status === 404) {
          res = await fetch(`${API}/api/scholar/save/${encodeURIComponent(row.paperId)}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: authHeaders(),
          })
        }
        if (res.ok) okCount += 1
      } catch {
        // Swallowed intentionally — surfaced via aggregate toast below.
      }
    }
    showToast(
      okCount > 0 ? `Removed ${okCount} paper(s).` : 'Could not remove the selected papers.',
      okCount > 0 ? 'success' : 'error',
    )
    clearSelection()
    refetchShelves()
    refetchScholarSaved()
  }, [selected, allRows, clearSelection, refetchShelves, refetchScholarSaved])

  const handleBulkCite = useCallback(async () => {
    if (selected.size === 0) return
    const ids = [...selected]
    const lines = []
    for (const id of ids) {
      const row = allRows.find((r) => r.id === id)
      if (!row?.paperId) continue
      try {
        const res = await fetch(`${API}/api/scholar/cite`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({ paperId: row.paperId, style: 'bibtex' }),
        })
        if (res.ok) {
          const json = await res.json()
          // Backend returns `{ formatted, contentType, filename, style }`
          // (scholar.cite.controller.js). Accept the legacy `citation`
          // alias too in case an older route shape ever ships.
          const text = json?.formatted || json?.citation
          if (text) lines.push(text)
        }
      } catch {
        // Best-effort — partial success still surfaces below.
      }
    }
    if (lines.length === 0) {
      showToast('Could not generate any citations.', 'error')
      return
    }
    const blob = lines.join('\n\n')
    try {
      await navigator.clipboard.writeText(blob)
      showToast(`Copied ${lines.length} BibTeX entries to clipboard.`, 'success')
    } catch {
      // Some browsers reject clipboard writes off a non-trusted gesture;
      // fall through to a download.
      const file = new Blob([blob], { type: 'text/plain' })
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = 'scholar-saved.bib'
      a.rel = 'noopener noreferrer'
      a.click()
      URL.revokeObjectURL(url)
      showToast(`Exported ${lines.length} BibTeX entries.`, 'success')
    }
  }, [selected, allRows])

  const handleMoveToShelf = useCallback(() => {
    // Future: open a shelf picker modal. For now a placeholder action so
    // the bulk-bar button surfaces; the underlying endpoint exists for
    // single-row moves via PATCH /api/library/books/:id.
    showToast('Shelf move coming soon — open a paper to change its shelf.', 'info')
  }, [])

  // Sync selection when the visible row set changes — drop any selected
  // ids that are no longer visible so the bulk bar always reflects reality.
  // Deferred via a microtask so the setState does not run synchronously
  // inside the effect body (React Compiler `set-state-in-effect`).
  useEffect(() => {
    const visibleIds = new Set(visibleRows.map((r) => r.id))
    Promise.resolve().then(() => {
      setSelected((prev) => {
        if (prev.size === 0) return prev
        const next = new Set()
        for (const id of prev) if (visibleIds.has(id)) next.add(id)
        return next.size === prev.size ? prev : next
      })
    })
  }, [visibleRows])

  // ── Render ──────────────────────────────────────────────────────────────
  const activeShelfName = activeShelfId
    ? shelves.find((s) => s.id === activeShelfId)?.name || 'Shelf'
    : 'All saved'

  return (
    <ScholarShell mainId="scholar-saved-main">
      <div
        className="scholar-shell scholar-list__page"
        style={{ paddingTop: 0, paddingBottom: 'calc(48px + env(safe-area-inset-bottom))' }}
      >
        <header className="scholar-list__header">
          <div>
            <h1 className="scholar-saved__h1">{activeShelfName}</h1>
            <p style={{ color: 'var(--sh-subtext)', margin: '6px 0 0' }}>
              {visibleRows.length} {visibleRows.length === 1 ? 'paper' : 'papers'}
            </p>
          </div>
          <div className="scholar-list__controls">
            <label htmlFor="scholar-saved-sort" style={SR_ONLY_STYLE}>
              Sort
            </label>
            <select
              id="scholar-saved-sort"
              className="scholar-list__select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
            <label htmlFor="scholar-saved-filter" style={SR_ONLY_STYLE}>
              Filter
            </label>
            <select
              id="scholar-saved-filter"
              className="scholar-list__select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Filter: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Mobile chip strip (hidden ≥1024) */}
        <div className="scholar-saved__chips" role="tablist" aria-label="Shelves">
          <button
            type="button"
            role="tab"
            aria-current={activeShelfId === null ? 'page' : undefined}
            className="scholar-saved__chip"
            onClick={() => goToShelf(null)}
          >
            All saved <span style={{ opacity: 0.7 }}>({allRows.length})</span>
          </button>
          {shelves.map((shelf) => {
            const count = shelfCounts.get(shelf.id) || 0
            return (
              <button
                key={shelf.id}
                type="button"
                role="tab"
                aria-current={activeShelfId === shelf.id ? 'page' : undefined}
                data-empty={count === 0 ? 'true' : undefined}
                className="scholar-saved__chip"
                onClick={() => goToShelf(shelf.id)}
              >
                {shelf.name} <span style={{ opacity: 0.7 }}>({count})</span>
              </button>
            )
          })}
        </div>

        <div className="scholar-saved__layout">
          {/* Desktop rail */}
          <aside className="scholar-saved__rail" aria-label="Shelves">
            <div className="scholar-saved__rail-heading">Quick filters</div>
            <button
              type="button"
              className="scholar-saved__rail-btn"
              aria-current={activeShelfId === null && filter === 'all' ? 'page' : undefined}
              data-empty={allRows.length === 0 ? 'true' : undefined}
              onClick={() => {
                setFilter('all')
                goToShelf(null)
              }}
            >
              <span>All saved</span>
              <span className="scholar-saved__rail-count">{allRows.length}</span>
            </button>
            <button
              type="button"
              className="scholar-saved__rail-btn"
              aria-current={activeShelfId === null && sort === 'recent' ? 'page' : undefined}
              data-empty={recentCount === 0 ? 'true' : undefined}
              onClick={() => {
                setSort('recent')
                goToShelf(null)
              }}
            >
              <span>Recently saved</span>
              <span className="scholar-saved__rail-count">{recentCount}</span>
            </button>
            <button
              type="button"
              className="scholar-saved__rail-btn"
              aria-current={filter === 'unread' ? 'page' : undefined}
              data-empty={unreadCount === 0 ? 'true' : undefined}
              onClick={() => {
                setFilter('unread')
                goToShelf(null)
              }}
            >
              <span>Unread</span>
              <span className="scholar-saved__rail-count">{unreadCount}</span>
            </button>

            <div className="scholar-saved__rail-divider" />
            <div className="scholar-saved__rail-heading">Shelves</div>
            {shelves.length === 0 && (
              <div
                style={{
                  padding: '6px 12px',
                  color: 'var(--sh-subtext)',
                  fontSize: 'var(--type-xs)',
                }}
              >
                No shelves yet.
              </div>
            )}
            {shelves.map((shelf) => {
              const count = shelfCounts.get(shelf.id) || 0
              return (
                <button
                  key={shelf.id}
                  type="button"
                  className="scholar-saved__rail-btn"
                  aria-current={activeShelfId === shelf.id ? 'page' : undefined}
                  data-empty={count === 0 ? 'true' : undefined}
                  onClick={() => goToShelf(shelf.id)}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shelf.name}
                  </span>
                  <span className="scholar-saved__rail-count">{count}</span>
                </button>
              )
            })}

            <button
              type="button"
              className="scholar-saved__rail-add"
              onClick={handleCreateShelf}
              disabled={creatingShelf}
            >
              <span aria-hidden="true">+</span>
              <span>{creatingShelf ? 'Creating…' : 'New shelf'}</span>
            </button>
          </aside>

          <section aria-label="Saved papers">
            {loading && <SkeletonGrid />}

            {!loading && hasError && (
              <div
                style={{
                  color: 'var(--sh-danger-text)',
                  background: 'var(--sh-danger-bg)',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--sh-border)',
                }}
              >
                Could not load your saved papers right now. Try refreshing.
              </div>
            )}

            {!loading && !hasError && visibleRows.length === 0 && (
              <div className="scholar-saved__empty">
                <h2 className="scholar-saved__empty-headline">No saved papers match this view</h2>
                <p className="scholar-saved__empty-body">
                  Open a paper from search and click Save to start building a reading list.
                </p>
                <Link to="/scholar/search" className="scholar-saved__empty-cta-primary">
                  Browse Scholar
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
            )}

            {!loading && !hasError && visibleRows.length > 0 && (
              <div className="scholar-list__grid">
                {visibleRows.map((row) => {
                  const isSelected = selected.has(row.id)
                  const cardHref = `/scholar/paper/${encodeURIComponent(row.paperId || row.id)}`
                  const authorLine =
                    row.author ||
                    (Array.isArray(row.authors) ? row.authors[0]?.name || '' : '') ||
                    'Unknown author'
                  const metaBits = []
                  if (row.venue) metaBits.push(row.venue)
                  if (row.year) metaBits.push(row.year)
                  if (row.shelfName) metaBits.push(row.shelfName)
                  return (
                    <article
                      key={row.id}
                      className="scholar-saved__card"
                      data-selected={isSelected ? 'true' : 'false'}
                    >
                      <label className="scholar-saved__checkbox-hit">
                        <input
                          type="checkbox"
                          className="scholar-saved__checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.title}`}
                        />
                      </label>
                      <Link
                        to={cardHref}
                        className="scholar-saved__card-title"
                        style={{ color: 'var(--sh-heading)' }}
                      >
                        {row.title}
                      </Link>
                      <div className="scholar-saved__card-meta">{authorLine}</div>
                      {metaBits.length > 0 && (
                        <div
                          className="scholar-saved__card-meta"
                          style={{ fontSize: 'var(--type-xs)' }}
                        >
                          {metaBits.join(' · ')}
                        </div>
                      )}
                      <div className="scholar-saved__card-footer">
                        {!row.isRead && (
                          <span className="scholar-saved__badge scholar-saved__badge--unread">
                            Unread
                          </span>
                        )}
                        {row.annotationCount > 0 && (
                          <span className="scholar-saved__badge scholar-saved__badge--annotations">
                            {row.annotationCount}{' '}
                            {row.annotationCount === 1 ? 'annotation' : 'annotations'}
                          </span>
                        )}
                        {row.hasNotes && <span className="scholar-saved__badge">Notes</span>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            {selected.size > 0 && (
              <div className="scholar-bulk-bar" role="region" aria-label="Bulk actions">
                <span className="scholar-bulk-bar__count">{selected.size} selected</span>
                <button type="button" className="scholar-action-btn" onClick={handleMoveToShelf}>
                  Move to shelf
                </button>
                <button type="button" className="scholar-action-btn" onClick={handleBulkCite}>
                  Cite all (BibTeX)
                </button>
                <button type="button" className="scholar-action-btn" onClick={handleBulkRemove}>
                  Remove from saved
                </button>
                <button
                  type="button"
                  className="scholar-action-btn"
                  onClick={clearSelection}
                  aria-label="Clear selection"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </div>

        <Link
          to="/scholar"
          style={{
            display: 'inline-block',
            marginTop: 32,
            color: 'var(--sh-brand)',
            textDecoration: 'none',
          }}
        >
          ← Back to Scholar
        </Link>
      </div>
      <ConfirmDialog
        open={bulkRemoveOpen}
        title="Remove saved papers?"
        message={`Remove ${selected.size} saved paper${selected.size === 1 ? '' : 's'} from your shelf? You can re-save them anytime from the paper's page.`}
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={confirmBulkRemove}
        onCancel={() => setBulkRemoveOpen(false)}
      />
    </ScholarShell>
  )
}
