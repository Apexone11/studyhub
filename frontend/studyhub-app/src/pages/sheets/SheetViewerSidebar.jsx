import { Link } from 'react-router-dom'
import {
  IconCheck,
  IconDownload,
  IconEye,
  IconGitPullRequest,
  IconX,
} from '../../components/Icons'
import { API } from '../../config'
import ContributionInlineDiff from './ContributionInlineDiff'
import { FONT, panelStyle, linkButton, statusBadge } from './sheetViewerConstants'

function ContributionList({ title, items, canReview, onReview, reviewingId }) {
  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>{title}</h2>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, #f0fdf4, #bbf7d0)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading, #0f172a)', marginBottom: 4 }}>No contributions yet</div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.5 }}>Fork this sheet to suggest improvements.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {item.forkSheet?.title || 'Contribution'}
                </span>
                <span style={statusBadge(item.status)}>{item.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
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
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #bbf7d0',
                      background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700,
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
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #fecaca',
                      background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700,
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
        <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>Sheet stats</h2>
        <div style={{ display: 'grid', gap: 10, color: '#64748b', fontSize: 13 }}>
          <div>{sheet.stars || 0} stars</div>
          <div>{sheet.commentCount || 0} comments</div>
          <div>{sheet.downloads || 0} downloads</div>
          <div>{sheet.forks || 0} forks</div>
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
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#fff',
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
                loading="lazy"
                style={{ width: '100%', height: 220, border: 'none' }}
              />
            )}
          </div>
        ) : null}
      </section>
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
