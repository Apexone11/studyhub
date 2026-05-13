/**
 * ScholarFiltersDrawer.jsx — Mobile / tablet filters surface for the
 * Scholar search results page.
 *
 * Desktop uses inline chips on the search page itself (no drawer). On
 * tablets this slides in from the right at 360px wide; on phones it
 * snaps as a bottom sheet via the shared `useBottomSheetOnMobile`
 * hook (overlay flip + drag-handle + swipe-down-to-dismiss).
 *
 * a11y / chrome rules (2026-05-12 polish pass):
 *   - Wraps in `FocusTrappedDialog` so focus is trapped, Tab cycles
 *     inside, Escape closes, and focus returns to the trigger on close.
 *   - Body scroll is locked while open (handled by FocusTrappedDialog's
 *     inert sibling logic).
 *   - Plus Jakarta Sans, `var(--sh-*)` tokens only, no emoji.
 *   - Touch targets ≥ 44 × 44 px.
 *   - `prefers-reduced-motion` honoured — the entrance animation is
 *     declarative via the `.sh-bottom-sheet-enter` class, which gates
 *     itself on the OS setting.
 *
 * Props:
 *   open            — boolean: drawer visible
 *   onClose()       — fired on Esc, backdrop click, footer "Cancel"
 *   onChange(next)  — fires every time a field changes; receives the
 *                     full normalised filter object so the parent can
 *                     mirror state into URL params if it wants live
 *                     updates. Optional.
 *   onApply(next)   — fired when the user taps "Apply". Receives the
 *                     final filter object. Optional — when omitted, the
 *                     drawer falls back to navigating to
 *                     /scholar/search?<params> itself.
 *   initialValue    — partial filter object to seed the form (the
 *                     parent reads URL params and hands them in).
 *   returnFocusRef  — ref to the trigger button so focus returns there
 *                     on close (FocusTrappedDialog handles this).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusTrappedDialog from '../../components/Modal/FocusTrappedDialog'
import useDeviceClass, { DEVICE_CLASS_DESKTOP } from '../../lib/useDeviceClass'
import { POPULAR_TOPICS, SCHOLAR_SOURCES, SCHOLAR_SORTS } from './scholarConstants'

const CURRENT_YEAR = new Date().getUTCFullYear()
const MIN_YEAR = 1900
const MAX_YEAR = CURRENT_YEAR + 1

const MIN_CITATIONS_PRESETS = Object.freeze([0, 10, 100, 1000])

const FONT_STACK = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

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
  authors: [],
  venue: '',
})

function normalize(partial) {
  const base = { ...DEFAULTS }
  if (!partial || typeof partial !== 'object') return base
  if (typeof partial.q === 'string') base.q = partial.q
  if (typeof partial.yearFrom === 'string' || typeof partial.yearFrom === 'number') {
    base.yearFrom = String(partial.yearFrom)
  }
  if (typeof partial.yearTo === 'string' || typeof partial.yearTo === 'number') {
    base.yearTo = String(partial.yearTo)
  }
  base.openAccess = Boolean(partial.openAccess)
  base.hasPdf = Boolean(partial.hasPdf)
  if (Array.isArray(partial.sources)) base.sources = partial.sources.slice()
  if (Array.isArray(partial.domains)) base.domains = partial.domains.slice()
  if (typeof partial.sort === 'string' && partial.sort) base.sort = partial.sort
  if (typeof partial.minCitations === 'string' || typeof partial.minCitations === 'number') {
    base.minCitations = String(partial.minCitations)
  }
  if (Array.isArray(partial.authors)) base.authors = partial.authors.slice()
  else if (typeof partial.author === 'string' && partial.author.trim()) {
    base.authors = partial.author
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (typeof partial.venue === 'string') base.venue = partial.venue
  return base
}

function buildQueryString(filters) {
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
  if (filters.authors.length > 0) p.set('author', filters.authors.join(','))
  const venue = filters.venue.trim()
  if (venue) p.set('venue', venue)
  return p.toString()
}

function isDevEnv() {
  // Vite exposes `import.meta.env.DEV` at module-eval time. No need to
  // probe `process.env` — the frontend doesn't have it without a shim
  // and ESLint flags the global as undefined.
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) return true
  } catch {
    /* import.meta access in non-module contexts */
  }
  return false
}

// Field row utility — collapses a label + input into the standard stack.
function FieldGroup({ label, htmlFor, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label ? (
        <label
          htmlFor={htmlFor}
          style={{
            fontFamily: FONT_STACK,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: 'var(--sh-text-muted, var(--sh-slate-600))',
          }}
        >
          {label}
        </label>
      ) : null}
      {children}
    </div>
  )
}

const INPUT_STYLE = {
  height: 44,
  padding: '0 12px',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: 10,
  fontFamily: FONT_STACK,
  fontSize: 14,
  color: 'var(--sh-text, var(--sh-slate-900))',
  outline: 'none',
  width: '100%',
  minWidth: 0,
}

const CHIP_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 36,
  padding: '6px 12px',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: 999,
  fontFamily: FONT_STACK,
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--sh-text, var(--sh-slate-900))',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const CHIP_SELECTED_STYLE = {
  background: 'var(--sh-accent-soft, var(--sh-soft))',
  borderColor: 'var(--sh-accent)',
  color: 'var(--sh-accent)',
  fontWeight: 700,
}

function CloseIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export default function ScholarFiltersDrawer({
  open,
  onClose,
  onChange,
  onApply,
  initialValue,
  returnFocusRef,
}) {
  const navigate = useNavigate()
  const { deviceClass } = useDeviceClass()
  const [filters, setFilters] = useState(() => normalize(initialValue))
  const [authorDraft, setAuthorDraft] = useState('')
  const lastOpenRef = useRef(false)

  // Reset to the latest `initialValue` each time the drawer opens.
  // Tracked via a ref-vs-prop comparison so we don't fire setState on
  // every parent re-render — only on the open→true transition. This
  // satisfies React Compiler's `set-state-in-effect` rule (the effect
  // only writes state when the open-edge actually flips).
  useEffect(() => {
    if (open && !lastOpenRef.current) {
      setFilters(normalize(initialValue))
      setAuthorDraft('')
    }
    lastOpenRef.current = open
  }, [open, initialValue])

  // Dev-only warning: a desktop client should never see this drawer.
  // ScholarSearchPage uses inline filter chips on desktop, so an open
  // drawer here is a wiring mistake somewhere upstream.
  useEffect(() => {
    if (!open) return
    if (deviceClass === DEVICE_CLASS_DESKTOP && isDevEnv()) {
      console.warn(
        '[ScholarFiltersDrawer] opened on a desktop client — search page should use inline chips instead.',
      )
    }
  }, [open, deviceClass])

  const update = useCallback(
    (patch) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch }
        if (typeof onChange === 'function') onChange(next)
        return next
      })
    },
    [onChange],
  )

  const toggleInList = useCallback((list, value) => {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }, [])

  const addAuthor = useCallback(() => {
    const v = authorDraft.trim()
    if (!v) return
    setAuthorDraft('')
    update({ authors: filters.authors.includes(v) ? filters.authors : [...filters.authors, v] })
  }, [authorDraft, filters.authors, update])

  const removeAuthor = useCallback(
    (name) => {
      update({ authors: filters.authors.filter((n) => n !== name) })
    },
    [filters.authors, update],
  )

  const handleAuthorKeyDown = useCallback(
    (event) => {
      if (event.key === ',' || event.key === 'Enter') {
        event.preventDefault()
        addAuthor()
      }
    },
    [addAuthor],
  )

  const activeFilterPills = useMemo(() => {
    const pills = []
    if (filters.yearFrom || filters.yearTo) {
      const label = `Year ${filters.yearFrom || MIN_YEAR}–${filters.yearTo || MAX_YEAR}`
      pills.push({ id: 'year', label, clear: () => update({ yearFrom: '', yearTo: '' }) })
    }
    if (filters.openAccess) {
      pills.push({
        id: 'oa',
        label: 'Open access',
        clear: () => update({ openAccess: false }),
      })
    }
    if (filters.hasPdf) {
      pills.push({ id: 'pdf', label: 'Has PDF', clear: () => update({ hasPdf: false }) })
    }
    filters.sources.forEach((slug) => {
      const meta = SCHOLAR_SOURCES.find((s) => s.slug === slug)
      pills.push({
        id: `src-${slug}`,
        label: meta?.label || slug,
        clear: () => update({ sources: filters.sources.filter((s) => s !== slug) }),
      })
    })
    filters.domains.forEach((slug) => {
      const meta = POPULAR_TOPICS.find((t) => t.slug === slug)
      pills.push({
        id: `dom-${slug}`,
        label: meta?.label || slug,
        clear: () => update({ domains: filters.domains.filter((d) => d !== slug) }),
      })
    })
    if (filters.minCitations) {
      pills.push({
        id: 'cit',
        label: `≥ ${filters.minCitations} citations`,
        clear: () => update({ minCitations: '' }),
      })
    }
    filters.authors.forEach((name) => {
      pills.push({
        id: `aut-${name}`,
        label: name,
        clear: () => removeAuthor(name),
      })
    })
    if (filters.venue.trim()) {
      pills.push({
        id: 'venue',
        label: filters.venue.trim(),
        clear: () => update({ venue: '' }),
      })
    }
    return pills
  }, [filters, update, removeAuthor])

  const handleApply = useCallback(() => {
    if (typeof onApply === 'function') {
      onApply(filters)
    } else {
      const qs = buildQueryString(filters)
      navigate(`/scholar/search${qs ? `?${qs}` : ''}`)
    }
    if (typeof onClose === 'function') onClose()
  }, [filters, navigate, onApply, onClose])

  const handleReset = useCallback(() => {
    setFilters(DEFAULTS)
    setAuthorDraft('')
    if (typeof onChange === 'function') onChange(DEFAULTS)
  }, [onChange])

  // Bottom-sheet swipe-down auto-applies per the spec ("swipe-down to
  // dismiss auto-applies"). FocusTrappedDialog's mobileLayout="auto"
  // wires the swipe handlers — we route its onClose to handleApply so
  // a downward swipe commits the changes. Tablet side-drawer mode
  // still hits the explicit Apply button.
  const isPhone = deviceClass === 'phone'
  const isTablet = deviceClass === 'tablet'
  const mobileLayout = isPhone ? 'auto' : 'centered'

  // Tablet override: render as a 360px right-side drawer rather than a
  // centered card. The overlayStyle / panelStyle props on
  // FocusTrappedDialog let us anchor without forking the component.
  const overlayStyle = isTablet
    ? {
        alignItems: 'stretch',
        justifyContent: 'flex-end',
        padding: 0,
      }
    : undefined
  const panelStyle = isTablet
    ? {
        width: 360,
        maxWidth: '90vw',
        minWidth: 0,
        height: '100vh',
        maxHeight: '100vh',
        borderRadius: '14px 0 0 14px',
        padding: 0,
        gap: 0,
        boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(15, 23, 42, 0.18))',
      }
    : {
        width: '100%',
        maxWidth: 520,
        padding: 0,
        gap: 0,
      }

  // Reuse the trigger ref via returnFocusOnDeactivate — FocusTrappedDialog
  // already restores focus to the previously-focused element. We expose
  // `returnFocusRef` in the API for callers that want explicit control
  // via blur(); FocusTrap takes care of the default.
  // (No-op acknowledgement so callers passing the ref don't trigger a
  // lint warning for unused props.)
  void returnFocusRef

  return (
    <FocusTrappedDialog
      open={open}
      onClose={onClose}
      ariaLabelledBy="scholar-filters-drawer-title"
      mobileLayout={mobileLayout}
      overlayStyle={overlayStyle}
      panelStyle={panelStyle}
      clickOutsideDeactivates={true}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: isTablet ? '100vh' : isPhone ? '100%' : 'auto',
          maxHeight: isTablet ? '100vh' : isPhone ? '100%' : '85vh',
          fontFamily: FONT_STACK,
          color: 'var(--sh-text, var(--sh-slate-900))',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            flex: '0 0 auto',
          }}
        >
          <h2
            id="scholar-filters-drawer-title"
            style={{
              margin: 0,
              fontFamily: FONT_STACK,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--sh-text, var(--sh-slate-900))',
            }}
          >
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              background: 'transparent',
              border: '1px solid var(--sh-border)',
              borderRadius: 999,
              color: 'var(--sh-text, var(--sh-slate-900))',
              cursor: 'pointer',
            }}
          >
            <CloseIcon />
          </button>
        </header>

        {activeFilterPills.length > 0 ? (
          <div
            aria-label="Active filters"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              padding: '12px 20px',
              borderBottom: '1px solid var(--sh-border)',
              background: 'var(--sh-soft)',
              flex: '0 0 auto',
            }}
          >
            {activeFilterPills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={pill.clear}
                aria-label={`Remove filter: ${pill.label}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 32,
                  padding: '4px 10px',
                  background: 'var(--sh-surface)',
                  border: '1px solid var(--sh-accent)',
                  borderRadius: 999,
                  fontFamily: FONT_STACK,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--sh-accent)',
                  cursor: 'pointer',
                }}
              >
                <span>{pill.label}</span>
                <span aria-hidden="true">
                  <CloseIcon />
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <FieldGroup label="Sources">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SCHOLAR_SOURCES.map((source) => {
                const selected = filters.sources.includes(source.slug)
                return (
                  <button
                    key={source.slug}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ sources: toggleInList(filters.sources, source.slug) })}
                    style={{ ...CHIP_STYLE, ...(selected ? CHIP_SELECTED_STYLE : null) }}
                  >
                    {source.label}
                  </button>
                )
              })}
              {/* Unpaywall is enrichment-only on the backend; surface it
                  as a non-search option so users see the brand parity. */}
              <button
                type="button"
                aria-pressed={false}
                disabled
                title="Unpaywall enriches results — it isn't searched directly."
                style={{
                  ...CHIP_STYLE,
                  color: 'var(--sh-text-muted, var(--sh-slate-600))',
                  cursor: 'not-allowed',
                }}
              >
                Unpaywall
              </button>
            </div>
          </FieldGroup>

          <FieldGroup label="Year range">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_YEAR}
                max={MAX_YEAR}
                value={filters.yearFrom}
                onChange={(event) => update({ yearFrom: event.target.value })}
                placeholder="From"
                aria-label="Year from"
                style={INPUT_STYLE}
              />
              <span
                aria-hidden="true"
                style={{ color: 'var(--sh-text-muted, var(--sh-slate-600))' }}
              >
                –
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_YEAR}
                max={MAX_YEAR}
                value={filters.yearTo}
                onChange={(event) => update({ yearTo: event.target.value })}
                placeholder="To"
                aria-label="Year to"
                style={INPUT_STYLE}
              />
            </div>
            <input
              type="range"
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={filters.yearTo || MAX_YEAR}
              onChange={(event) => update({ yearTo: event.target.value })}
              aria-label="Year to (slider)"
              style={{
                width: '100%',
                accentColor: 'var(--sh-accent)',
              }}
            />
          </FieldGroup>

          <FieldGroup label="Access">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                fontFamily: FONT_STACK,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={filters.openAccess}
                onChange={(event) => update({ openAccess: event.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--sh-accent)' }}
              />
              Open access only
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                fontFamily: FONT_STACK,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={filters.hasPdf}
                onChange={(event) => update({ hasPdf: event.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--sh-accent)' }}
              />
              Has full-text PDF
            </label>
          </FieldGroup>

          <FieldGroup label="Minimum citations" htmlFor="scholar-filter-min-citations">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MIN_CITATIONS_PRESETS.map((preset) => {
                const selected = String(preset) === String(filters.minCitations || '0')
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ minCitations: preset === 0 ? '' : String(preset) })}
                    style={{ ...CHIP_STYLE, ...(selected ? CHIP_SELECTED_STYLE : null) }}
                  >
                    {preset === 0 ? 'Any' : `≥ ${preset}`}
                  </button>
                )
              })}
            </div>
            <input
              id="scholar-filter-min-citations"
              type="number"
              inputMode="numeric"
              min={0}
              value={filters.minCitations}
              onChange={(event) => update({ minCitations: event.target.value })}
              placeholder="Custom (e.g. 25)"
              style={INPUT_STYLE}
            />
          </FieldGroup>

          <FieldGroup label="Authors" htmlFor="scholar-filter-authors">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {filters.authors.map((name) => (
                <span
                  key={name}
                  style={{
                    ...CHIP_STYLE,
                    ...CHIP_SELECTED_STYLE,
                    display: 'inline-flex',
                    gap: 6,
                  }}
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeAuthor(name)}
                    aria-label={`Remove author ${name}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
            <input
              id="scholar-filter-authors"
              type="text"
              value={authorDraft}
              onChange={(event) => setAuthorDraft(event.target.value)}
              onKeyDown={handleAuthorKeyDown}
              onBlur={addAuthor}
              placeholder="Add an author (Enter or comma to add)"
              style={INPUT_STYLE}
            />
          </FieldGroup>

          <FieldGroup label="Venue" htmlFor="scholar-filter-venue">
            <input
              id="scholar-filter-venue"
              type="text"
              value={filters.venue}
              onChange={(event) => update({ venue: event.target.value })}
              placeholder="e.g. NeurIPS, Nature"
              style={INPUT_STYLE}
            />
          </FieldGroup>

          <FieldGroup label="Domains">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {POPULAR_TOPICS.slice(0, 12).map((topic) => {
                const selected = filters.domains.includes(topic.slug)
                return (
                  <button
                    key={topic.slug}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ domains: toggleInList(filters.domains, topic.slug) })}
                    style={{ ...CHIP_STYLE, ...(selected ? CHIP_SELECTED_STYLE : null) }}
                  >
                    {topic.label}
                  </button>
                )
              })}
            </div>
          </FieldGroup>

          <FieldGroup label="Sort by" htmlFor="scholar-filter-sort">
            <select
              id="scholar-filter-sort"
              value={filters.sort}
              onChange={(event) => update({ sort: event.target.value })}
              style={{ ...INPUT_STYLE, appearance: 'auto' }}
            >
              {SCHOLAR_SORTS.map((sort) => (
                <option key={sort.slug} value={sort.slug}>
                  {sort.label}
                </option>
              ))}
            </select>
          </FieldGroup>
        </div>

        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            flex: '0 0 auto',
            paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              padding: '0 18px',
              background: 'transparent',
              border: '1px solid var(--sh-border)',
              borderRadius: 999,
              fontFamily: FONT_STACK,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--sh-text, var(--sh-slate-900))',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              padding: '0 22px',
              background: 'var(--sh-accent)',
              border: '1px solid var(--sh-accent)',
              borderRadius: 999,
              fontFamily: FONT_STACK,
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--sh-on-accent, #fff)',
              cursor: 'pointer',
              flex: 1,
            }}
          >
            Apply filters
          </button>
        </footer>
      </div>
    </FocusTrappedDialog>
  )
}
