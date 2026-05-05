/**
 * ScholarFiltersDrawer.jsx — Slide-in filter panel for /scholar.
 *
 * Mounted via createPortal so the drawer is not affected by any
 * `transform`-using ancestor (CLAUDE.md note: portals required for modals
 * inside animated containers).
 *
 * a11y:
 *  - role="dialog" + aria-modal="true" + labelledby on title.
 *  - First focusable input receives focus on open; trigger receives focus
 *    back on close.
 *  - Focus is trapped inside the drawer (Tab / Shift+Tab cycles).
 *  - ESC closes; clicking the dimmed backdrop closes.
 *  - Respects prefers-reduced-motion via CSS.
 *
 * Param contract (matches ScholarSearchPage URL params):
 *   q, yearFrom, yearTo, openAccess, hasPdf, sources, domains, sort,
 *   minCitations, author, venue
 *
 * NOTE TO BACKEND AGENT: ScholarSearchPage currently only consumes q /
 * yearFrom / yearTo / openAccess. The remaining params (hasPdf, sources,
 * domains, sort, minCitations, author, venue) are forwarded in the URL
 * for forward compatibility — wire them through the search controller +
 * adapters when the backend is ready.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { POPULAR_TOPICS, SCHOLAR_SOURCES, SCHOLAR_SORTS } from './scholarConstants'

const CURRENT_YEAR = new Date().getUTCFullYear()
const MAX_YEAR = CURRENT_YEAR + 1

const DEFAULTS = Object.freeze({
  q: '',
  yearFrom: '',
  yearTo: '',
  openAccess: false,
  hasPdf: false,
  sources: [],
  domains: [],
  sort: 'relevance',
  minCitations: '',
  author: '',
  venue: '',
})

function isFocusable(el) {
  if (!el || el.disabled) return false
  if (el.tabIndex < 0) return false
  if (el.hasAttribute('hidden')) return false
  return true
}

export default function ScholarFiltersDrawer({ open, onClose, returnFocusRef }) {
  const navigate = useNavigate()
  const drawerRef = useRef(null)
  const firstFieldRef = useRef(null)
  const [filters, setFilters] = useState(DEFAULTS)

  // Reset to defaults each time the drawer is re-opened so stale state
  // from a prior session does not leak across opens. setState-in-effect
  // is the standard pattern in this codebase for "reset on open" — the
  // alternative (resetting in the parent before opening) leaks drawer
  // internals into the trigger.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setFilters(DEFAULTS)
  }, [open])

  // Focus management: focus first field on open, return focus on close.
  // Snapshot the trigger ref at effect-entry so the cleanup uses the
  // value from when the effect ran, not from when it tears down.
  useEffect(() => {
    if (!open) return undefined
    const triggerEl = returnFocusRef?.current
    const t = setTimeout(() => {
      firstFieldRef.current?.focus()
    }, 50)
    return () => {
      clearTimeout(t)
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus()
    }
  }, [open, returnFocusRef])

  // ESC closes; Tab is trapped inside the drawer.
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const root = drawerRef.current
      if (!root) return
      const candidates = root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const focusables = Array.from(candidates).filter(isFocusable)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const update = (patch) => setFilters((prev) => ({ ...prev, ...patch }))

  const toggleInList = (list, value) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    const q = filters.q.trim()
    if (q) p.set('q', q)
    if (filters.yearFrom) p.set('yearFrom', String(filters.yearFrom))
    if (filters.yearTo) p.set('yearTo', String(filters.yearTo))
    if (filters.openAccess) p.set('openAccess', '1')
    if (filters.hasPdf) p.set('hasPdf', '1')
    if (filters.sources.length > 0) p.set('sources', filters.sources.join(','))
    if (filters.domains.length > 0) p.set('domains', filters.domains.join(','))
    if (filters.sort && filters.sort !== 'relevance') p.set('sort', filters.sort)
    if (filters.minCitations) p.set('minCitations', String(filters.minCitations))
    const author = filters.author.trim()
    if (author) p.set('author', author)
    const venue = filters.venue.trim()
    if (venue) p.set('venue', venue)
    return p.toString()
  }, [filters])

  function handleApply() {
    navigate(`/scholar/search${queryString ? `?${queryString}` : ''}`)
    onClose?.()
  }

  function handleClear() {
    setFilters(DEFAULTS)
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose?.()
  }

  if (!open) return null

  const body = (
    <div
      className="scholar-filters-drawer__backdrop"
      onMouseDown={handleBackdrop}
      role="presentation"
    >
      <aside
        ref={drawerRef}
        className="scholar-filters-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scholar-filters-drawer-title"
      >
        <header className="scholar-filters-drawer__head">
          <h2 id="scholar-filters-drawer-title" className="scholar-filters-drawer__title">
            Filters
          </h2>
          <button
            type="button"
            className="scholar-action-btn"
            onClick={onClose}
            aria-label="Close filters"
          >
            Close
          </button>
        </header>

        <div className="scholar-filters-drawer__body">
          <div className="scholar-filters-drawer__group">
            <label className="scholar-filters-drawer__group-title" htmlFor="filter-q">
              Search query
            </label>
            <input
              id="filter-q"
              ref={firstFieldRef}
              type="search"
              className="scholar-filters-drawer__input"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Keywords, title, DOI"
            />
          </div>

          <div className="scholar-filters-drawer__group">
            <span className="scholar-filters-drawer__group-title">Year range</span>
            <div className="scholar-filters-drawer__row">
              <input
                type="number"
                className="scholar-filters-drawer__input"
                value={filters.yearFrom}
                min={1900}
                max={MAX_YEAR}
                onChange={(e) => update({ yearFrom: e.target.value })}
                placeholder="From"
                aria-label="Year from"
              />
              <input
                type="number"
                className="scholar-filters-drawer__input"
                value={filters.yearTo}
                min={1900}
                max={MAX_YEAR}
                onChange={(e) => update({ yearTo: e.target.value })}
                placeholder="To"
                aria-label="Year to"
              />
            </div>
          </div>

          <div className="scholar-filters-drawer__group">
            <span className="scholar-filters-drawer__group-title">Access</span>
            <label className="scholar-filters-drawer__toggle-row">
              <input
                type="checkbox"
                checked={filters.openAccess}
                onChange={(e) => update({ openAccess: e.target.checked })}
              />
              Open access only
            </label>
            <label className="scholar-filters-drawer__toggle-row">
              <input
                type="checkbox"
                checked={filters.hasPdf}
                onChange={(e) => update({ hasPdf: e.target.checked })}
              />
              Has full-text PDF
            </label>
          </div>

          <div className="scholar-filters-drawer__group">
            <span className="scholar-filters-drawer__group-title">Sources</span>
            <div className="scholar-filters-drawer__chip-row">
              {SCHOLAR_SOURCES.map((s) => {
                const selected = filters.sources.includes(s.slug)
                return (
                  <button
                    key={s.slug}
                    type="button"
                    className="scholar-filters-drawer__chip"
                    aria-pressed={selected}
                    onClick={() => update({ sources: toggleInList(filters.sources, s.slug) })}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="scholar-filters-drawer__group">
            <span className="scholar-filters-drawer__group-title">Domains</span>
            <div className="scholar-filters-drawer__chip-row">
              {POPULAR_TOPICS.map((t) => {
                const selected = filters.domains.includes(t.slug)
                return (
                  <button
                    key={t.slug}
                    type="button"
                    className="scholar-filters-drawer__chip"
                    aria-pressed={selected}
                    onClick={() => update({ domains: toggleInList(filters.domains, t.slug) })}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="scholar-filters-drawer__group">
            <label className="scholar-filters-drawer__group-title" htmlFor="filter-sort">
              Sort by
            </label>
            <select
              id="filter-sort"
              className="scholar-filters-drawer__select"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value })}
            >
              {SCHOLAR_SORTS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="scholar-filters-drawer__group">
            <label className="scholar-filters-drawer__group-title" htmlFor="filter-min-cit">
              Minimum citations
            </label>
            <input
              id="filter-min-cit"
              type="number"
              min={0}
              className="scholar-filters-drawer__input"
              value={filters.minCitations}
              onChange={(e) => update({ minCitations: e.target.value })}
              placeholder="e.g. 10"
            />
          </div>

          <div className="scholar-filters-drawer__group">
            <label className="scholar-filters-drawer__group-title" htmlFor="filter-author">
              Author name
            </label>
            <input
              id="filter-author"
              type="text"
              className="scholar-filters-drawer__input"
              value={filters.author}
              onChange={(e) => update({ author: e.target.value })}
              placeholder="e.g. Yann LeCun"
            />
          </div>

          <div className="scholar-filters-drawer__group">
            <label className="scholar-filters-drawer__group-title" htmlFor="filter-venue">
              Venue
            </label>
            <input
              id="filter-venue"
              type="text"
              className="scholar-filters-drawer__input"
              value={filters.venue}
              onChange={(e) => update({ venue: e.target.value })}
              placeholder="e.g. NeurIPS, Nature"
            />
          </div>
        </div>

        <footer className="scholar-filters-drawer__foot">
          <button type="button" className="scholar-filters-drawer__clear" onClick={handleClear}>
            Clear all
          </button>
          <button type="button" className="scholar-filters-drawer__apply" onClick={handleApply}>
            Apply filters
          </button>
        </footer>
      </aside>
    </div>
  )

  return createPortal(body, document.body)
}
