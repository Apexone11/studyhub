/**
 * ScholarCompareSheet.jsx — side-by-side comparison for 2–4 papers.
 *
 * Completes the search page's Compare flow: the selection already lives
 * in `?compare=id1,id2` (deep-linkable); this sheet renders the matrix
 * from the paper objects already loaded in the results list — no extra
 * fetches. A selected id that is no longer in the current result list
 * (filters changed, page refetched) gets a stub column with a link to
 * the paper page instead of crashing or silently vanishing.
 *
 * Mounted via FocusTrappedDialog (portal, focus trap, Esc close) per the
 * repo modal rule; bottom-sheet flip on phones via mobileLayout="auto".
 */
import { useId } from 'react'
import { Link } from 'react-router-dom'
import FocusTrappedDialog from '../../../components/Modal/FocusTrappedDialog'
import { cleanAbstract, formatCount, truncate } from '../scholarConstants'

function paperYear(paper) {
  if (!paper?.publishedAt) return null
  const y = new Date(paper.publishedAt).getUTCFullYear()
  return Number.isFinite(y) ? y : null
}

function sourceLabel(source) {
  const map = {
    semanticScholar: 'Semantic Scholar',
    semantic_scholar: 'Semantic Scholar',
    openAlex: 'OpenAlex',
    openalex: 'OpenAlex',
    arxiv: 'arXiv',
    crossref: 'CrossRef',
  }
  return map[source] || source || '—'
}

function summaryText(paper) {
  const tldr = typeof paper?.tldr === 'string' && paper.tldr.trim() ? paper.tldr.trim() : null
  const abstract = cleanAbstract(paper?.abstract || '')
  const body = tldr || abstract
  return body ? truncate(body, 220) : '—'
}

const ROWS = [
  { key: 'year', label: 'Year', render: (p) => paperYear(p) ?? '—' },
  { key: 'venue', label: 'Venue', render: (p) => p.venue || '—' },
  {
    key: 'citations',
    label: 'Cited by',
    render: (p) => (Number.isFinite(p.citationCount) ? formatCount(p.citationCount) : '—'),
  },
  {
    key: 'oa',
    label: 'Open access',
    render: (p) => (p.openAccess === true ? 'Yes — free PDF' : 'No'),
  },
  { key: 'source', label: 'Source', render: (p) => sourceLabel(p.source || p.sourceName) },
  { key: 'summary', label: 'Summary', render: (p) => summaryText(p) },
]

export default function ScholarCompareSheet({ paperIds = [], papers = [], onClose }) {
  const titleId = useId()

  // Preserve the user's selection order; fall back to a stub for ids
  // that dropped out of the loaded result list.
  const columns = paperIds.map((id) => ({
    id,
    paper: papers.find((p) => p && p.id === id) || null,
  }))

  return (
    <FocusTrappedDialog
      open
      onClose={onClose}
      ariaLabelledBy={titleId}
      mobileLayout="auto"
      panelStyle={{
        width: 'min(960px, 100%)',
        maxWidth: 'min(960px, 100%)',
        maxHeight: '90vh',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <header className="scholar-compare__header">
        <h2 id={titleId} className="scholar-compare__title">
          Compare papers
        </h2>
        <button
          type="button"
          className="scholar-compare__close"
          onClick={onClose}
          aria-label="Close comparison"
        >
          ×
        </button>
      </header>

      <div className="scholar-compare__scroll">
        <table className="scholar-compare__table">
          <thead>
            <tr>
              <th scope="col" className="scholar-compare__row-label" aria-label="Field" />
              {columns.map(({ id, paper }) => (
                <th key={id} scope="col" className="scholar-compare__paper-head">
                  {paper ? (
                    <>
                      <Link
                        to={`/scholar/paper/${encodeURIComponent(id)}`}
                        className="scholar-compare__paper-title"
                      >
                        {paper.title || 'Untitled'}
                      </Link>
                      {Array.isArray(paper.authors) && paper.authors.length > 0 && (
                        <span className="scholar-compare__paper-authors">
                          {paper.authors
                            .slice(0, 2)
                            .map((a) => (typeof a === 'string' ? a : a?.name))
                            .filter(Boolean)
                            .join(', ')}
                          {paper.authors.length > 2 ? ' · et al.' : ''}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="scholar-compare__paper-title scholar-compare__paper-title--missing">
                        No longer in these results
                      </span>
                      <Link
                        to={`/scholar/paper/${encodeURIComponent(id)}`}
                        className="scholar-compare__paper-authors"
                      >
                        Open its paper page
                      </Link>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="scholar-compare__row-label">
                  {row.label}
                </th>
                {columns.map(({ id, paper }) => (
                  <td key={id} className="scholar-compare__cell">
                    {paper ? row.render(paper) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FocusTrappedDialog>
  )
}
