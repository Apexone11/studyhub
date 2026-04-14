import { Link } from 'react-router-dom'
import { IconComment, IconFork, IconStar, IconStarFilled } from '../../components/Icons'
import StudyStatusChip from '../../components/StudyStatusChip'
import {
  resolveSheetFormat,
  formatBadgeText,
  timeAgo,
  computeSignalBadge,
  SIGNAL_BADGE_CONFIG,
  isEditableSheetStatus,
} from './sheetsPageConstants'

export default function SheetListRow({ sheet, forking, onOpen, onStar, onFork, studyStatus }) {
  const format = resolveSheetFormat(sheet)
  const detailPath = isEditableSheetStatus(sheet.status)
    ? `/sheets/upload?draft=${sheet.id}`
    : `/sheets/${sheet.id}`
  const authorName = sheet.author?.username || 'Unknown author'
  const schoolLabel = sheet.course?.school?.short || sheet.course?.school?.name || 'StudyHub'
  const preview = (sheet.description || sheet.content || 'No summary available yet.')
    .replace(/\s+/g, ' ')
    .trim()
  const signal = computeSignalBadge(sheet)
  const signalConfig = signal ? SIGNAL_BADGE_CONFIG[signal] : null

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
          <Link to={detailPath} onClick={(event) => event.stopPropagation()}>
            {sheet.title}
          </Link>
          {signalConfig ? (
            <span className={`sheets-repo-row__signal ${signalConfig.className}`}>
              {signalConfig.label}
            </span>
          ) : null}
          {studyStatus ? <StudyStatusChip status={studyStatus} /> : null}
        </h2>
        {sheet.forkSource ? (
          <p className="sheets-repo-row__fork-lineage">
            Forked from{' '}
            <Link
              to={`/sheets/${sheet.forkSource.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              {sheet.forkSource.title}
            </Link>
            {sheet.forkSource.author ? <> by {sheet.forkSource.author.username}</> : null}
          </p>
        ) : null}
        <p className="sheets-repo-row__description">{preview}</p>
        <div className="sheets-repo-row__meta">
          <span>
            {sheet.course?.code || 'General'} · {schoolLabel}
          </span>
          <span aria-hidden="true">•</span>
          {sheet.author?.username ? (
            <span>
              by{' '}
              <Link
                to={`/users/${sheet.author.username}`}
                onClick={(event) => event.stopPropagation()}
              >
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
            <span className="sh-pill sheets-repo-row__status-badge sheets-repo-row__status-badge--draft">
              Draft
            </span>
          ) : sheet.status === 'rejected' ? (
            <span className="sh-pill sheets-repo-row__status-badge sheets-repo-row__status-badge--danger">
              Rejected
            </span>
          ) : sheet.status === 'quarantined' ? (
            <span className="sh-pill sheets-repo-row__status-badge sheets-repo-row__status-badge--danger">
              Quarantined
            </span>
          ) : (sheet.htmlRiskTier || 0) === 1 ? (
            <span className="sh-pill sheets-repo-row__status-badge sheets-repo-row__status-badge--warning">
              Flagged
            </span>
          ) : (sheet.htmlRiskTier || 0) >= 2 || sheet.status === 'pending_review' ? (
            <span className="sh-pill sheets-repo-row__status-badge sheets-repo-row__status-badge--review">
              Pending Review
            </span>
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
          {(sheet.commentCount || 0) > 0 ? (
            <span className="sheets-repo-row__stat">
              <IconComment size={13} />
              {sheet.commentCount}
            </span>
          ) : null}
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
