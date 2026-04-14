import { Link } from 'react-router-dom'
import UserAvatar from '../../../components/UserAvatar'
import VerificationBadge from '../../../components/verification/VerificationBadge'
import { IconFork, IconStar, IconArrowLeft } from '../../../components/Icons'
import { FONT, statusPill, timeAgo } from './sheetViewerConstants'

const STUDY_STATUS_COPY = {
  default: {
    heading: 'Not in your study queue yet',
    body: 'Mark this sheet for later, keep it in your active rotation, or record it as finished. Your dashboard queue updates instantly.',
    background: 'var(--sh-soft)',
    border: 'var(--sh-border)',
    accent: 'var(--sh-brand)',
  },
  'to-review': {
    heading: 'Queued for review',
    body: 'This sheet stays in your review queue until you move it into active studying or mark it done.',
    background: 'var(--sh-warning-bg)',
    border: 'var(--sh-warning-border)',
    accent: 'var(--sh-warning-text)',
  },
  studying: {
    heading: 'In your active study rotation',
    body: 'Use this while you are actively working through the material so it stays surfaced on your dashboard.',
    background: 'var(--sh-info-bg)',
    border: 'var(--sh-info-border)',
    accent: 'var(--sh-brand)',
  },
  done: {
    heading: 'Marked complete',
    body: 'This keeps a finished record in your study history without cluttering the active queue.',
    background: 'var(--sh-success-bg)',
    border: 'var(--sh-success-border)',
    accent: 'var(--sh-success-text)',
  },
}

export default function SheetHeader({
  sheet,
  handleBack,
  user,
  studyStatus,
  studyStatusEntry,
  setStudyStatus,
  STUDY_STATUSES,
}) {
  if (!sheet) return null

  const studyStatusDetails = STUDY_STATUS_COPY[studyStatus] || STUDY_STATUS_COPY.default

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Row 1: Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--sh-muted)',
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--sh-brand)',
            fontWeight: 600,
            fontSize: 13,
            fontFamily: FONT,
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
              style={{
                color: 'var(--sh-brand)',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              {sheet.course.code}
            </Link>
          </>
        )}
      </div>

      {/* Row 2: Title + status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            lineHeight: 1.2,
          }}
        >
          {sheet.title}
        </h1>
        <span style={statusPill(sheet.status)}>
          {sheet.status === 'pending_review' ? 'Pending review' : sheet.status}
        </span>
      </div>

      {/* Row 3: Author + verification + metadata */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          fontSize: 13,
          color: 'var(--sh-subtext)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserAvatar
            username={sheet.author?.username}
            avatarUrl={sheet.author?.avatarUrl}
            role={sheet.author?.role}
            plan={sheet.author?.plan}
            isDonor={sheet.author?.isDonor}
            donorLevel={sheet.author?.donorLevel}
            size={28}
          />
          <Link
            to={`/users/${sheet.author?.username}`}
            style={{ color: 'var(--sh-heading)', fontWeight: 700, textDecoration: 'none' }}
          >
            {sheet.author?.username || 'Unknown'}
          </Link>
          <VerificationBadge user={sheet.author} size={14} />
        </div>

        {sheet.course?.code && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              background: 'var(--sh-brand-soft)',
              color: 'var(--sh-brand-hover)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {sheet.course.code}
          </span>
        )}

        {sheet.course?.school?.short && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              background: 'var(--sh-soft)',
              color: 'var(--sh-muted)',
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid var(--sh-border)',
            }}
          >
            {sheet.course.school.short}
          </span>
        )}

        <span style={{ color: 'var(--sh-muted)' }}>
          updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
        </span>
      </div>

      {/* Fork relationship banner */}
      {sheet.forkSource && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '8px 14px',
            borderRadius: 10,
            background: 'var(--sh-info-bg)',
            border: '1px solid var(--sh-info-border)',
            color: 'var(--sh-info-text, var(--sh-subtext))',
            fontSize: 12,
          }}
        >
          <IconFork size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
          <span>
            Forked from{' '}
            <Link
              to={`/sheets/${sheet.forkSource.id}`}
              style={{ color: 'var(--sh-brand)', fontWeight: 700, textDecoration: 'none' }}
            >
              {sheet.forkSource.title}
            </Link>
            {sheet.forkSource.author && (
              <>
                {' '}
                by{' '}
                <Link
                  to={`/users/${sheet.forkSource.author.username}`}
                  style={{ color: 'var(--sh-brand)', fontWeight: 700, textDecoration: 'none' }}
                >
                  {sheet.forkSource.author.username}
                </Link>
              </>
            )}
          </span>
          <Link
            to={`/sheets/${sheet.id}/lab?tab=contribute`}
            style={{
              marginLeft: 'auto',
              padding: '6px 12px',
              borderRadius: 6,
              minHeight: 28,
              background: 'var(--sh-brand)',
              color: 'var(--sh-btn-primary-text)',
              fontSize: 11,
              fontWeight: 700,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Contribute back
          </Link>
        </div>
      )}

      {/* Stats summary */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          fontSize: 12,
          color: 'var(--sh-muted)',
          fontWeight: 600,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconStar size={12} /> {sheet.stars || 0} stars
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconFork size={12} /> {sheet.forks || 0} forks
        </span>
        <span>{sheet.commentCount || 0} comments</span>
      </div>

      {user && typeof setStudyStatus === 'function' && Array.isArray(STUDY_STATUSES) ? (
        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: '14px 16px',
            borderRadius: 14,
            background: studyStatusDetails.background,
            border: `1px solid ${studyStatusDetails.border}`,
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
          >
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--sh-muted)',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                Study status
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: studyStatusDetails.accent }}>
                {studyStatusDetails.heading}
              </span>
              <span style={{ fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
                {studyStatusDetails.body}
                {studyStatusEntry?.updatedAt
                  ? ` Updated ${timeAgo(studyStatusEntry.updatedAt)}.`
                  : ''}
              </span>
            </div>
            {studyStatus ? (
              <button
                type="button"
                onClick={() => setStudyStatus(null, sheet)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '7px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--sh-border)',
                  background: 'var(--sh-surface)',
                  color: 'var(--sh-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                Clear status
              </button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STUDY_STATUSES.map((statusOption) => (
              <button
                key={statusOption.value}
                type="button"
                onClick={() =>
                  setStudyStatus(
                    studyStatus === statusOption.value ? null : statusOption.value,
                    sheet,
                  )
                }
                aria-pressed={studyStatus === statusOption.value}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  border:
                    studyStatus === statusOption.value ? 'none' : '1px solid var(--sh-border)',
                  background:
                    studyStatus === statusOption.value ? statusOption.color : 'var(--sh-surface)',
                  color: studyStatus === statusOption.value ? '#fff' : 'var(--sh-text)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                {statusOption.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
