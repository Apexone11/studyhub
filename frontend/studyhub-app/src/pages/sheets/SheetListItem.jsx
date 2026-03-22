import { Link } from 'react-router-dom'
import {
  IconFork,
  IconStar,
  IconStarFilled,
} from '../../components/Icons'
import { resolveSheetFormat, formatBadgeText, timeAgo } from './sheetsPageConstants'

export default function SheetListRow({ sheet, forking, onOpen, onStar, onFork }) {
  const format = resolveSheetFormat(sheet)
  const authorName = sheet.author?.username || 'Unknown author'
  const schoolLabel = sheet.course?.school?.short || sheet.course?.school?.name || 'StudyHub'
  const preview = (sheet.description || sheet.content || 'No summary available yet.').replace(/\s+/g, ' ').trim()

  const handleRowKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(sheet.id)
    }
  }

  return (
    <article
      className="sheets-repo-row"
      role="link"
      tabIndex={0}
      onClick={() => onOpen(sheet.id)}
      onKeyDown={handleRowKeyDown}
      aria-label={`Open ${sheet.title}`}
    >
      <div className="sheets-repo-row__main">
        <h2 className="sheets-repo-row__title">
          <Link to={`/sheets/${sheet.id}`} onClick={(event) => event.stopPropagation()}>
            {sheet.title}
          </Link>
        </h2>
        <p className="sheets-repo-row__description">{preview}</p>
        <div className="sheets-repo-row__meta">
          <span>{sheet.course?.code || 'General'} · {schoolLabel}</span>
          <span aria-hidden="true">•</span>
          {sheet.author?.username ? (
            <span>
              by{' '}
              <Link to={`/users/${sheet.author.username}`} onClick={(event) => event.stopPropagation()}>
                {sheet.author.username}
              </Link>
            </span>
          ) : (
            <span>by {authorName}</span>
          )}
          <span aria-hidden="true">•</span>
          <span>Updated {timeAgo(sheet.updatedAt || sheet.createdAt)}</span>
          <span aria-hidden="true">•</span>
          <span className={`sh-pill sheets-repo-row__format sheets-repo-row__format--${format}`}>
            {formatBadgeText(format)}
          </span>
          {sheet.status === 'draft' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-muted)', background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', borderRadius: 6, padding: '1px 6px' }}>Draft</span>
          ) : sheet.status === 'rejected' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-danger)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger)', borderRadius: 6, padding: '1px 6px' }}>Rejected</span>
          ) : sheet.status === 'quarantined' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-danger)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger)', borderRadius: 6, padding: '1px 6px' }}>Quarantined</span>
          ) : (sheet.htmlRiskTier || 0) === 1 ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ca8a04', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px' }}>Flagged</span>
          ) : (sheet.htmlRiskTier || 0) >= 2 || sheet.status === 'pending_review' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px' }}>Pending Review</span>
          ) : null}
        </div>
      </div>

      <div className="sheets-repo-row__side">
        <div className="sheets-repo-row__stats" aria-label="Sheet stats">
          <span className="sheets-repo-row__stat">
            <IconStar size={13} />
            {sheet.stars || 0}
          </span>
          <span className="sheets-repo-row__stat">
            <IconFork size={13} />
            {sheet.forks || 0}
          </span>
        </div>
        <div className="sheets-repo-row__actions">
          <button
            type="button"
            className={`sh-btn sh-btn--secondary sh-btn--sm sheets-repo-row__action ${sheet.starred ? 'is-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onStar(sheet)
            }}
            aria-pressed={Boolean(sheet.starred)}
            aria-label={`Star ${sheet.title}`}
          >
            {sheet.starred ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            Star
          </button>
          <button
            type="button"
            className="sh-btn sh-btn--secondary sh-btn--sm sheets-repo-row__action"
            onClick={(event) => {
              event.stopPropagation()
              onFork(sheet)
            }}
            disabled={forking}
            aria-label={`Fork ${sheet.title}`}
          >
            <IconFork size={13} />
            {forking ? 'Forking...' : 'Fork'}
          </button>
        </div>
      </div>
    </article>
  )
}
