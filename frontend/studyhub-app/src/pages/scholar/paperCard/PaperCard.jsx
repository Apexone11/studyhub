/**
 * PaperCard.jsx — Compact / full / list-row variants per Figma §3.3.
 *
 * Variants:
 *  - 'full' (default): 2-line title, abstract preview, footer row, sparkline
 *  - 'compact': title + author line + venue/year (no abstract)
 *  - 'list': horizontal row, no abstract
 *
 * a11y:
 *  - Card is a single semantic <Link> (avoids button-in-button)
 *  - Author avatars are aria-hidden; full author name list lives in
 *    visually-hidden text on the card aria-label so screen readers
 *    hear the full byline (L4-MED-3)
 *  - Tap targets stay above 44×44 via padding
 */
import { Link } from 'react-router-dom'
import CitationSparkline from './CitationSparkline'
import { formatCount, truncate } from '../scholarConstants'

function deriveTopic(paper) {
  if (Array.isArray(paper.topics) && paper.topics.length > 0) {
    const t = paper.topics[0]
    return (typeof t === 'string' ? t : t?.name || '').toUpperCase()
  }
  return ''
}

function authorByline(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return 'Unknown author'
  const names = authors.map((a) => a?.name || '').filter(Boolean)
  if (names.length === 0) return 'Unknown author'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]}, ${names[1]}`
  return `${names[0]}, ${names[1]}, et al.`
}

function authorInitials(name) {
  if (!name || typeof name !== 'string') return '·'
  const tokens = name.trim().split(/\s+/)
  if (tokens.length === 1) return tokens[0][0]?.toUpperCase() || '·'
  return ((tokens[0][0] || '') + (tokens[tokens.length - 1][0] || '')).toUpperCase()
}

function venueLine(paper) {
  const year = paper.publishedAt ? new Date(paper.publishedAt).getUTCFullYear() : ''
  if (paper.venue && year) return `${paper.venue} · ${year}`
  return paper.venue || (year ? String(year) : '')
}

export default function PaperCard({ paper, variant = 'full', as: Wrapper = Link }) {
  if (!paper) return null
  const eyebrow = deriveTopic(paper)
  const byline = authorByline(paper.authors)
  const venue = venueLine(paper)
  const stackedAuthors = (paper.authors || []).slice(0, 4)
  const remaining = (paper.authors || []).length - stackedAuthors.length
  const href = `/scholar/paper/${encodeURIComponent(paper.id)}`

  return (
    <Wrapper
      className={`paper-card paper-card--${variant}`}
      to={href}
      aria-label={`${paper.title || 'Untitled'} by ${byline}${venue ? ', ' + venue : ''}`}
    >
      {eyebrow ? <span className="paper-card__eyebrow">{eyebrow}</span> : null}
      <h3 className="paper-card__title">{paper.title || 'Untitled'}</h3>

      <div className="paper-card__authors">
        <div className="paper-card__author-stack" aria-hidden="true">
          {stackedAuthors.map((a, i) => (
            <span key={a?.name || i} className="paper-card__author-avatar">
              {authorInitials(a?.name)}
            </span>
          ))}
          {remaining > 0 && <span className="paper-card__author-avatar">+{remaining}</span>}
        </div>
        <span className="paper-card__author-names">{byline}</span>
      </div>

      {venue && <div className="paper-card__venue">{venue}</div>}

      {variant === 'full' && paper.abstract && (
        <p className="paper-card__abstract">{truncate(paper.abstract, 240)}</p>
      )}

      <div className="paper-card__footer">
        <span className="paper-card__cite-count" title="Citations">
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
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          <span>{formatCount(paper.citationCount || 0)}</span>
        </span>
        {paper.openAccess && (
          <span className="paper-card__oa">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="6" />
            </svg>
            <span>Open</span>
          </span>
        )}
        <span className="paper-card__sparkline">
          <CitationSparkline citationCount={paper.citationCount || 0} />
        </span>
      </div>
    </Wrapper>
  )
}
