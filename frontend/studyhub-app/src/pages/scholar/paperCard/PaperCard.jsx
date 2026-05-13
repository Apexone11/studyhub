/**
 * PaperCard.jsx — Core building block for every Scholar list/grid.
 *
 * Variants:
 *   - 'default' (alias 'full'): rich card — source/year/venue, OA badge,
 *     title, authors, TLDR or 3-line abstract, citation strip + sparkline,
 *     optional smart-citation pills, "Why this paper?" affordance, action
 *     bar (Save / Cite / Open / Share-to-group).
 *   - 'compact': title + authors + year only (Recently-viewed strips).
 *   - 'selectable': default layout + checkbox in the top-left for bulk
 *     select on ScholarSavedPage.
 *
 * The card is a <Link> wrapper so the entire surface navigates to the
 * paper detail page. Action-bar buttons live OUTSIDE the link wrapper to
 * avoid nested-interactive a11y warnings — they sit in a sibling action
 * row inside the same outer <article>. Click on any action stops
 * propagation so the parent <Link> doesn't also fire.
 *
 * a11y notes:
 *   - Each card is wrapped in an <article> with an aria-labelledby
 *     pointing at the title element.
 *   - Action buttons have aria-label text and ≥44×44 hit areas.
 *   - "Why this paper?" affordance: hover-tooltip on desktop, long-press
 *     opens a popover on touch (deviceClass + isTouch from
 *     useDeviceClass). Tooltip uses role="tooltip" and aria-describedby.
 *   - External links carry rel="noopener noreferrer".
 *
 * Compat:
 *   - The legacy variant value `'full'` is preserved as an alias of
 *     `'default'`. Existing callers (ScholarSearchPage,
 *     ScholarTopicPage, ScholarPage) keep working without churn.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import CitationSparkline from './CitationSparkline'
import { formatCount, truncate } from '../scholarConstants'
import useDeviceClass from '../../../lib/useDeviceClass'
import './PaperCard.css'

// Accept both 'default' and the legacy 'full' alias.
function normalizeVariant(v) {
  if (v === 'full') return 'default'
  if (v === 'compact' || v === 'selectable') return v
  return 'default'
}

function authorList(authors) {
  if (!Array.isArray(authors)) return []
  return authors
    .map((a) => (typeof a === 'string' ? { name: a } : a))
    .filter((a) => a && typeof a.name === 'string' && a.name.trim().length > 0)
}

function venueYear(paper) {
  const year = paper.publishedAt ? new Date(paper.publishedAt).getUTCFullYear() : null
  return {
    year: Number.isFinite(year) ? year : null,
    venue: typeof paper.venue === 'string' && paper.venue.trim() ? paper.venue.trim() : null,
  }
}

function sourceBadgeLabel(source) {
  if (!source) return ''
  const map = {
    semanticScholar: 'Semantic Scholar',
    semantic_scholar: 'Semantic Scholar',
    openAlex: 'OpenAlex',
    openalex: 'OpenAlex',
    arxiv: 'arXiv',
    crossref: 'CrossRef',
  }
  return map[source] || (typeof source === 'string' ? source : '')
}

// Small reusable icons — kept inline (no external dep).
function IconStar({ filled }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconQuote() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 21c0-6 4-10 9-10" />
      <path d="M14 21c0-6 4-10 9-10" />
      <path d="M3 11V5a2 2 0 0 1 2-2h4v8H3z" />
      <path d="M14 11V5a2 2 0 0 1 2-2h4v8h-6z" />
    </svg>
  )
}

function IconBook() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

export default function PaperCard({
  paper,
  variant = 'default',
  selected = false,
  onToggleSelect,
  onSave,
  onCite,
  onShare,
  onAuthorClick,
  saved = false,
}) {
  const titleId = useId()
  const tooltipId = useId()
  const v = normalizeVariant(variant)
  const { deviceClass, isTouch } = useDeviceClass()
  const isDesktop = deviceClass === 'desktop' && !isTouch

  const [showMore, setShowMore] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const longPressTimer = useRef(null)

  // Close the touch-popover when tapping anywhere outside.
  useEffect(() => {
    if (!tooltipOpen || isDesktop) return undefined
    function onDocPointer(e) {
      if (e.target && e.target.closest && e.target.closest('.paper-card__why')) return
      setTooltipOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [tooltipOpen, isDesktop])

  if (!paper) return null

  const authors = authorList(paper.authors)
  const { year, venue } = venueYear(paper)
  const source = sourceBadgeLabel(paper.source || paper.sourceName)
  const href = `/scholar/paper/${encodeURIComponent(paper.id)}`
  const title =
    typeof paper.title === 'string' && paper.title.trim() ? paper.title.trim() : 'Untitled'

  // Body text: TLDR wins, otherwise 3-line clamped abstract with optional reveal.
  const tldr = typeof paper.tldr === 'string' && paper.tldr.trim() ? paper.tldr.trim() : null
  const abstract =
    typeof paper.abstract === 'string' && paper.abstract.trim() ? paper.abstract.trim() : null
  const bodyText = tldr || abstract
  const bodyIsClamped = !tldr && abstract && abstract.length > 240
  const shownBody = tldr ? tldr : showMore ? abstract : truncate(abstract || '', 240)

  // Smart-citation sentiment pills (only if at least one count present).
  const sentiment = paper.citationSentiment
  const hasSentiment =
    sentiment &&
    typeof sentiment === 'object' &&
    (Number.isFinite(sentiment.supportingCount) ||
      Number.isFinite(sentiment.contrastingCount) ||
      Number.isFinite(sentiment.mentioningCount))

  // "Why this paper?" — only render when the upstream meta provides text.
  const matchExplanation =
    paper._meta && typeof paper._meta.matchExplanation === 'string'
      ? paper._meta.matchExplanation.trim()
      : null

  // Compact short-circuit: title + authors + year only.
  if (v === 'compact') {
    return (
      <article className="paper-card paper-card--compact" aria-labelledby={titleId}>
        <Link to={href} className="paper-card__compact-link">
          <h3 id={titleId} className="paper-card__title paper-card__title--compact">
            {title}
          </h3>
          <div className="paper-card__compact-meta">
            {authors.length > 0 && (
              <span className="paper-card__compact-authors">
                {authors
                  .slice(0, 2)
                  .map((a) => a.name)
                  .join(', ')}
                {authors.length > 2 ? ' · et al.' : ''}
              </span>
            )}
            {year && <span className="paper-card__compact-year">{year}</span>}
          </div>
        </Link>
      </article>
    )
  }

  // Selectable / default share the rich layout.
  const isSelectable = v === 'selectable'

  function handleCheckboxChange(e) {
    e.stopPropagation()
    if (typeof onToggleSelect === 'function') onToggleSelect(paper, e.target.checked)
  }

  function handleAction(cb) {
    return (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (typeof cb === 'function') cb(paper)
    }
  }

  function handleAuthorClick(authorName) {
    return (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (typeof onAuthorClick === 'function') {
        onAuthorClick(authorName, paper)
      } else if (typeof window !== 'undefined') {
        window.location.href = `/scholar/search?author=${encodeURIComponent(authorName)}`
      }
    }
  }

  // Long-press handlers for touch tooltip.
  function handleWhyPointerDown() {
    if (isDesktop) return
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => setTooltipOpen(true), 350)
  }
  function handleWhyPointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  function handleWhyClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!isDesktop) setTooltipOpen((s) => !s)
  }

  return (
    <article
      className={`paper-card paper-card--default${
        isSelectable ? ' paper-card--selectable' : ''
      }${selected ? ' is-selected' : ''}`}
      aria-labelledby={titleId}
    >
      {isSelectable && (
        <label className="paper-card__select" aria-label={`Select ${title}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
          />
          <span aria-hidden="true" />
        </label>
      )}

      {/* Meta row: source · year · venue · OA */}
      <div className="paper-card__meta-row">
        {source && <span className="paper-card__source-pill">{source}</span>}
        {year && <span className="paper-card__meta-item">{year}</span>}
        {venue && (
          <span className="paper-card__meta-item paper-card__meta-venue" title={venue}>
            {venue}
          </span>
        )}
        {paper.openAccess === true && (
          <span className="paper-card__oa-pill" title="Open Access">
            OA
          </span>
        )}

        {matchExplanation && isDesktop && (
          <span className="paper-card__why-wrap">
            <button
              type="button"
              className="paper-card__why"
              aria-label="Why this paper?"
              aria-describedby={tooltipOpen ? tooltipId : undefined}
              onMouseEnter={() => setTooltipOpen(true)}
              onMouseLeave={() => setTooltipOpen(false)}
              onFocus={() => setTooltipOpen(true)}
              onBlur={() => setTooltipOpen(false)}
              onClick={(e) => e.preventDefault()}
            >
              <IconInfo />
            </button>
            {tooltipOpen && (
              <span id={tooltipId} role="tooltip" className="paper-card__why-tooltip">
                {matchExplanation}
              </span>
            )}
          </span>
        )}
        {matchExplanation && !isDesktop && (
          <span className="paper-card__why-wrap">
            <button
              type="button"
              className="paper-card__why"
              aria-label="Why this paper?"
              aria-describedby={tooltipOpen ? tooltipId : undefined}
              onPointerDown={handleWhyPointerDown}
              onPointerUp={handleWhyPointerUp}
              onPointerCancel={handleWhyPointerUp}
              onClick={handleWhyClick}
            >
              <IconInfo />
            </button>
            {tooltipOpen && (
              <span id={tooltipId} role="tooltip" className="paper-card__why-tooltip">
                {matchExplanation}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Title (linked) */}
      <Link to={href} className="paper-card__title-link">
        <h3 id={titleId} className="paper-card__title">
          {title}
        </h3>
      </Link>

      {/* Authors */}
      {authors.length > 0 && (
        <div className="paper-card__authors-row">
          {authors.slice(0, 3).map((a, i) => (
            <button
              key={`${a.name}-${i}`}
              type="button"
              className="paper-card__author-link"
              onClick={handleAuthorClick(a.name)}
            >
              {a.name}
            </button>
          ))}
          {authors.length > 3 && <span className="paper-card__author-more"> · et al.</span>}
        </div>
      )}

      {/* TLDR or abstract */}
      {bodyText && (
        <p className={`paper-card__body${tldr ? ' paper-card__body--tldr' : ''}`}>
          {tldr ? <span className="paper-card__tldr-tag">TLDR</span> : null}
          <span className="paper-card__body-text">{shownBody}</span>
          {bodyIsClamped && (
            <button
              type="button"
              className="paper-card__showmore"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowMore((s) => !s)
              }}
            >
              {showMore ? 'show less' : 'show more'}
            </button>
          )}
        </p>
      )}

      {/* Citation strip + sparkline */}
      <div className="paper-card__cite-strip">
        <Link
          to={`${href}?tab=citations`}
          className="paper-card__cite-count-link"
          onClick={(e) => e.stopPropagation()}
        >
          Cited by {formatCount(paper.citationCount || 0)}
        </Link>
        {Array.isArray(paper.citationHistogram) && paper.citationHistogram.length > 0 ? (
          <CitationSparkline data={paper.citationHistogram} />
        ) : (
          // Empty SVG slot — keeps row height stable when histogram absent.
          // TODO: backend to populate citationHistogram on all sources.
          <svg
            className="citation-sparkline citation-sparkline--empty"
            width="60"
            height="14"
            aria-hidden="true"
            focusable="false"
          />
        )}
      </div>

      {/* Smart citation sentiment pills */}
      {hasSentiment && (
        <div className="paper-card__sentiment" aria-label="Citation sentiment">
          {Number.isFinite(sentiment.supportingCount) && (
            <span
              className="paper-card__sentiment-pill paper-card__sentiment-pill--support"
              title="Supporting citations"
            >
              Supporting {formatCount(sentiment.supportingCount)}
            </span>
          )}
          {Number.isFinite(sentiment.contrastingCount) && (
            <span
              className="paper-card__sentiment-pill paper-card__sentiment-pill--contrast"
              title="Contrasting citations"
            >
              Contrasting {formatCount(sentiment.contrastingCount)}
            </span>
          )}
          {Number.isFinite(sentiment.mentioningCount) && (
            <span
              className="paper-card__sentiment-pill paper-card__sentiment-pill--mention"
              title="Mentioning citations"
            >
              Mentioning {formatCount(sentiment.mentioningCount)}
            </span>
          )}
        </div>
      )}

      {/* Action bar — each icon button is only rendered when the parent
          provided the matching handler. Earlier code rendered Save +
          Cite unconditionally, which made them look interactive but
          silently no-op when the parent forgot to wire the callback
          (audit Loop S11, 2026-05-13). Conditional render is the same
          contract `onShare` already used. */}
      <div className="paper-card__action-bar" role="group" aria-label="Paper actions">
        {typeof onSave === 'function' && (
          <button
            type="button"
            className={`paper-card__action${saved ? ' is-active' : ''}`}
            aria-label={saved ? 'Remove from saved' : 'Save paper'}
            aria-pressed={saved ? 'true' : 'false'}
            onClick={handleAction(onSave)}
          >
            <IconStar filled={saved} />
          </button>
        )}
        {typeof onCite === 'function' && (
          <button
            type="button"
            className="paper-card__action"
            aria-label="Cite paper"
            onClick={handleAction(onCite)}
          >
            <IconQuote />
          </button>
        )}
        <Link
          to={href}
          className="paper-card__action paper-card__action--link"
          aria-label="Open paper"
          onClick={(e) => e.stopPropagation()}
        >
          <IconBook />
        </Link>
        {typeof onShare === 'function' && (
          <button
            type="button"
            className="paper-card__action"
            aria-label="Add to study group"
            onClick={handleAction(onShare)}
          >
            <IconPeople />
          </button>
        )}
      </div>
    </article>
  )
}
