import { Link } from 'react-router-dom'
import {
  IconCheck,
  IconDownload,
  IconEye,
  IconFork,
  IconGitPullRequest,
  IconX,
} from '../../../components/Icons'
import VerificationBadge from '../../../components/verification/VerificationBadge'
import { API } from '../../../config'
import ContributionInlineDiff from '../lab/ContributionInlineDiff'
import { FONT, panelStyle, linkButton, statusBadge } from './sheetViewerConstants'

function ContributionList({ title, items, canReview, onReview, reviewingId }) {
  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)' }}>{title}</h2>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, var(--sh-success-bg), var(--sh-success-border))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sh-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>No contributions yet</div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5 }}>Fork this sheet, make edits, then use &ldquo;Contribute Back&rdquo; to suggest your changes to the author.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{ borderTop: '1px solid var(--sh-soft)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                  {item.forkSheet?.title || 'Contribution'}
                </span>
                <span style={statusBadge(item.status)}>{item.status}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
                {item.proposer?.username ? `Proposed by ${item.proposer.username}. ` : ''}
                {item.message || 'No message included.'}
              </div>
              <ContributionInlineDiff contributionId={item.id} />
              {canReview && item.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={reviewingId === item.id}
                    onClick={() => onReview(item.id, 'accept')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 8, border: '1px solid var(--sh-success-border)',
                      background: 'var(--sh-success-bg)', color: 'var(--sh-success)', fontSize: 11, fontWeight: 700,
                      cursor: reviewingId === item.id ? 'wait' : 'pointer', fontFamily: FONT,
                    }}
                  >
                    <IconCheck size={11} /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === item.id}
                    onClick={() => onReview(item.id, 'reject')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 8, border: '1px solid var(--sh-danger-border)',
                      background: 'var(--sh-danger-bg)', color: 'var(--sh-danger)', fontSize: 11, fontWeight: 700,
                      cursor: reviewingId === item.id ? 'wait' : 'pointer', fontFamily: FONT,
                    }}
                  >
                    <IconX size={11} /> Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function SheetViewerSidebar({ sheet, canEdit, previewKind, attachmentPreviewUrl, reviewingId, handleReviewContribution }) {
  if (!sheet) return null

  return (
    <aside style={{ display: 'grid', gap: 16 }}>
      <section style={panelStyle()}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)' }}>About</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--sh-avatar-bg)', color: 'var(--sh-avatar-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0,
          }}>
            {(sheet.author?.username || '?')[0]}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Link to={`/users/${sheet.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}>
                {sheet.author?.username || 'Unknown'}
              </Link>
              <VerificationBadge user={sheet.author} size={13} />
            </div>
            {sheet.course?.code && (
              <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{sheet.course.code}{sheet.course.school?.short ? ` \u2022 ${sheet.course.school.short}` : ''}</div>
            )}
          </div>
        </div>
      </section>
      <section style={panelStyle()}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)' }}>Sheet stats</h2>
        <div style={{ display: 'grid', gap: 10, color: 'var(--sh-subtext)', fontSize: 13 }}>
          <div>{sheet.stars || 0} stars</div>
          <div>{sheet.commentCount || 0} comments</div>
          <div>{sheet.downloads || 0} downloads</div>
          <div>{sheet.forks || 0} forks</div>
          <div>
            <Link to={`/sheets/${sheet.id}/lab`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
              View version history
            </Link>
          </div>
          {sheet.allowDownloads === false ? <div>Downloads disabled</div> : null}
          {sheet.hasAttachment ? (
            <Link to={`/preview/sheet/${sheet.id}`} style={linkButton()}>
              <IconEye size={14} />
              Full preview
            </Link>
          ) : null}
          {sheet.hasAttachment && sheet.allowDownloads !== false ? (
            <a href={`${API}/api/sheets/${sheet.id}/attachment`} style={linkButton()}>
              <IconDownload size={14} />
              Download attachment
            </a>
          ) : null}
        </div>
        {sheet.hasAttachment ? (
          <div
            style={{
              marginTop: 12,
              border: '1px solid var(--sh-border)',
              borderRadius: 12,
              overflow: 'hidden',
              background: 'var(--sh-surface)',
            }}
          >
            {previewKind === 'image' ? (
              <img
                src={attachmentPreviewUrl}
                alt={sheet.attachmentName || 'Attachment preview'}
                style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <iframe
                src={attachmentPreviewUrl}
                title={`Sheet attachment preview ${sheet.id}`}
                sandbox="allow-same-origin"
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{ width: '100%', height: 220, border: 'none' }}
              />
            )}
          </div>
        ) : null}
      </section>
      {/* ── Collaboration context ────────────────────────────────── */}
      {(sheet.forkSource || sheet.forks > 0 || sheet.incomingContributions?.length > 0 || sheet.outgoingContributions?.length > 0) ? (
        <section style={panelStyle()}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)' }}>Collaboration</h2>
          <div style={{ display: 'grid', gap: 8, fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
            {sheet.forkSource ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconFork size={12} />
                <span>
                  Forked from{' '}
                  <Link to={`/sheets/${sheet.forkSource.id}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>
                    {sheet.forkSource.title}
                  </Link>
                  {sheet.forkSource.author ? (
                    <> by <Link to={`/users/${sheet.forkSource.author.username}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>{sheet.forkSource.author.username}</Link><VerificationBadge user={sheet.forkSource.author} size={11} /></>
                  ) : null}
                </span>
              </div>
            ) : null}
            {sheet.forks > 0 ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconFork size={12} />
                <span>{sheet.forks} {sheet.forks === 1 ? 'fork' : 'forks'}</span>
              </div>
            ) : null}
            {sheet.incomingContributions?.filter((c) => c.status === 'pending').length > 0 ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconGitPullRequest size={12} />
                <span style={{ color: 'var(--sh-warning)', fontWeight: 600 }}>
                  {sheet.incomingContributions.filter((c) => c.status === 'pending').length} pending {sheet.incomingContributions.filter((c) => c.status === 'pending').length === 1 ? 'contribution' : 'contributions'}
                </span>
              </div>
            ) : null}
            {sheet.incomingContributions?.filter((c) => c.status === 'accepted').length > 0 ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconCheck size={12} />
                <span>{sheet.incomingContributions.filter((c) => c.status === 'accepted').length} accepted</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {sheet.incomingContributions ? (
        <ContributionList
          title="Incoming contributions"
          items={sheet.incomingContributions}
          canReview={canEdit}
          onReview={handleReviewContribution}
          reviewingId={reviewingId}
        />
      ) : null}
      {sheet.outgoingContributions ? (
        <ContributionList title="Outgoing contributions" items={sheet.outgoingContributions} />
      ) : null}
    </aside>
  )
}
