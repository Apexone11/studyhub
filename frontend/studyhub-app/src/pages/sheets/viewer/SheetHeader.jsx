import { Link } from 'react-router-dom'
import VerificationBadge from '../../../components/verification/VerificationBadge'
import { IconFork, IconStar, IconArrowLeft } from '../../../components/Icons'
import { FONT, statusPill, timeAgo } from './sheetViewerConstants'

export default function SheetHeader({ sheet, handleBack }) {
  if (!sheet) return null

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Row 1: Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--sh-muted)' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--sh-brand)', fontWeight: 600, fontSize: 13, fontFamily: FONT,
          }}
        >
          <IconArrowLeft size={12} />
          Sheets
        </button>
        {sheet.course?.code && (
          <>
            <span style={{ color: 'var(--sh-muted)' }}>/</span>
            <Link
              to={`/sheets?courseId=${sheet.course.id}`}
              style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}
            >
              {sheet.course.code}
            </Link>
          </>
        )}
      </div>

      {/* Row 2: Title + status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--sh-heading)', lineHeight: 1.2 }}>
          {sheet.title}
        </h1>
        <span style={statusPill(sheet.status)}>{sheet.status === 'pending_review' ? 'Pending review' : sheet.status}</span>
      </div>

      {/* Row 3: Author + verification + metadata */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--sh-subtext)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--sh-avatar-bg)', color: 'var(--sh-avatar-text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0,
            }}
          >
            {(sheet.author?.username || '?')[0]}
          </div>
          <Link
            to={`/users/${sheet.author?.username}`}
            style={{ color: 'var(--sh-heading)', fontWeight: 700, textDecoration: 'none' }}
          >
            {sheet.author?.username || 'Unknown'}
          </Link>
          <VerificationBadge user={sheet.author} size={14} />
        </div>

        {sheet.course?.code && (
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'var(--sh-brand-soft)', color: 'var(--sh-brand-hover)',
            fontSize: 11, fontWeight: 700,
          }}>
            {sheet.course.code}
          </span>
        )}

        {sheet.course?.school?.short && (
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'var(--sh-soft)', color: 'var(--sh-muted)',
            fontSize: 11, fontWeight: 700, border: '1px solid var(--sh-border)',
          }}>
            {sheet.course.school.short}
          </span>
        )}

        <span style={{ color: 'var(--sh-muted)' }}>
          updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
        </span>
      </div>

      {/* Fork lineage */}
      {sheet.forkSource && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--sh-subtext)', fontSize: 12 }}>
          <IconFork size={13} />
          <span>
            Forked from{' '}
            <Link to={`/sheets/${sheet.forkSource.id}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>
              {sheet.forkSource.title}
            </Link>
            {sheet.forkSource.author && (
              <> by <Link to={`/users/${sheet.forkSource.author.username}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>{sheet.forkSource.author.username}</Link></>
            )}
          </span>
        </div>
      )}

      {/* Stats summary */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconStar size={12} /> {sheet.stars || 0} stars
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconFork size={12} /> {sheet.forks || 0} forks
        </span>
        <span>{sheet.commentCount || 0} comments</span>
      </div>
    </div>
  )
}
