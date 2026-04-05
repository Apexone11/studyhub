import { Link } from 'react-router-dom'
import { Pager, PipelineBadge } from '../AdminWidgets'
import { createPageState, filterSelectStyle, pillButton } from '../adminConstants'

const TIER_LABELS = ['Clean', 'Flagged', 'High Risk', 'Quarantined']
const TIER_BADGE_COLORS = [
  { bg: 'var(--sh-success-bg)', color: 'var(--sh-success)', border: 'var(--sh-success-border)' },
  { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning)', border: 'var(--sh-warning-border)' },
  { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', border: 'var(--sh-warning-border)' },
  { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger)', border: 'var(--sh-danger-border)' },
]
const PREVIEW_MODE_LABELS = { 0: 'Interactive', 1: 'Safe', 2: 'Restricted', 3: 'Disabled' }

function TierBadge({ tier }) {
  const t = tier || 0
  if (t === 0) return null
  const c = TIER_BADGE_COLORS[t] || TIER_BADGE_COLORS[0]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {TIER_LABELS[t] || `Tier ${t}`}
    </span>
  )
}

function PreviewModeBadge({ tier }) {
  const t = tier || 0
  if (t === 0) return null
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--sh-info-bg)', color: 'var(--sh-info-text)', border: '1px solid var(--sh-info-border)' }}>
      {PREVIEW_MODE_LABELS[t] || 'Interactive'} preview
    </span>
  )
}

export default function SheetReviewsTab({
  reviewState,
  reviewStatus,
  reviewFormatFilter,
  reviewScanFilter,
  setReviewStatus,
  setReviewFormatFilter,
  setReviewScanFilter,
  setReviewState,
  reviewSheet,
  setReviewPanelSheetId,
  loadPagedData,
}) {
  return (
    <>
      {/* ── Filter bar ──────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
          {reviewState.total} sheet{reviewState.total !== 1 ? 's' : ''} in queue
          {reviewFormatFilter || reviewScanFilter ? ' (filtered)' : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={reviewStatus}
            onChange={(event) => {
              setReviewStatus(event.target.value)
              setReviewState(createPageState())
            }}
            style={filterSelectStyle}
            aria-label="Filter by status"
          >
            <option value="pending_review">Pending review</option>
            <option value="rejected">Rejected</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <select
            value={reviewFormatFilter}
            onChange={(event) => {
              setReviewFormatFilter(event.target.value)
              setReviewState(createPageState())
            }}
            style={filterSelectStyle}
            aria-label="Filter by format"
          >
            <option value="">All formats</option>
            <option value="html">HTML only</option>
            <option value="markdown">Markdown only</option>
          </select>
          <select
            value={reviewScanFilter}
            onChange={(event) => {
              setReviewScanFilter(event.target.value)
              setReviewState(createPageState())
            }}
            style={filterSelectStyle}
            aria-label="Filter by scan status"
          >
            <option value="">All scan states</option>
            <option value="queued">Scan queued</option>
            <option value="running">Scan running</option>
            <option value="passed">Scan passed</option>
            <option value="failed">Scan failed</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {reviewState.items.length === 0 && (
          <div className="admin-empty">No sheets match the current filters.</div>
        )}
        {reviewState.items.map((record) => (
          <div key={record.id} style={{ border: '1px solid var(--sh-border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 4 }}>
                  {record.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
                  {record.course?.code || 'No course'} · by {record.author?.username || 'unknown'} · {record.contentFormat || 'markdown'}
                </div>
              </div>
              {/* ── Pipeline status badges ──────────────────── */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <PipelineBadge label={record.status?.replace('_', ' ')} type={record.status === 'published' ? 'success' : record.status === 'rejected' ? 'danger' : record.status === 'pending_review' ? 'warning' : 'muted'} />
                {record.contentFormat === 'html' && (
                  <PipelineBadge label={`scan: ${record.htmlScanStatus || 'n/a'}`} type={record.htmlScanStatus === 'passed' ? 'success' : record.htmlScanStatus === 'failed' ? 'danger' : record.htmlScanStatus === 'running' ? 'info' : 'muted'} />
                )}
                {record.contentFormat === 'html' && <TierBadge tier={record.htmlRiskTier} />}
                {record.contentFormat === 'html' && <PreviewModeBadge tier={record.htmlRiskTier} />}
                {record.contentFormat === 'html' && Array.isArray(record.htmlScanFindings) && record.htmlScanFindings.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--sh-soft)', color: 'var(--sh-muted)', border: '1px solid var(--sh-border)' }}>
                    {record.htmlScanFindings.length} finding{record.htmlScanFindings.length !== 1 ? 's' : ''}
                  </span>
                )}
                {record.aiReviewDecision && (
                  <PipelineBadge
                    label={`AI: ${record.aiReviewDecision}`}
                    type={record.aiReviewDecision === 'approve' ? 'success' : record.aiReviewDecision === 'reject' ? 'danger' : 'warning'}
                  />
                )}
              </div>
            </div>
            {record.description ? (
              <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                {record.description}
              </div>
            ) : null}
            {/* ── Review history (if previously reviewed) ─── */}
            {record.reviewedBy && (
              <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: 'var(--sh-soft)' }}>
                Previously reviewed by <strong>{record.reviewedBy.username}</strong>
                {record.reviewedAt ? ` on ${new Date(record.reviewedAt).toLocaleDateString()}` : ''}
                {record.reviewReason ? ` — "${record.reviewReason}"` : ''}
              </div>
            )}
            {Array.isArray(record.htmlScanFindings) && record.htmlScanFindings.length > 0 ? (
              <div style={{ border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-danger-text)', marginBottom: 4 }}>
                  Security Scan Findings ({record.htmlScanFindings.length})
                  {record.htmlScanAcknowledgedAt ? ' · user acknowledged' : ''}
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--sh-danger-text)', fontSize: 11, lineHeight: 1.6 }}>
                  {record.htmlScanFindings.slice(0, 5).map((finding, index) => (
                    <li key={index}>{finding?.message || String(finding)}</li>
                  ))}
                  {record.htmlScanFindings.length > 5 && (
                    <li style={{ fontStyle: 'italic' }}>...and {record.htmlScanFindings.length - 5} more</li>
                  )}
                </ul>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to={`/sheets/${record.id}`} style={{ ...pillButton('#eff6ff', '#1d4ed8', '#bfdbfe'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Open
              </Link>
              {record.contentFormat === 'html' ? (
                <button type="button" onClick={() => setReviewPanelSheetId(record.id)} style={pillButton('#faf5ff', '#7c3aed', '#ddd6fe')}>
                  Review HTML
                </button>
              ) : null}
              <button type="button" onClick={() => void reviewSheet(record.id, 'approve')} style={pillButton('#ecfdf5', '#047857', '#a7f3d0')}>
                Quick Approve
              </button>
              <button type="button" onClick={() => void reviewSheet(record.id, 'reject')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                Quick Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      <Pager page={reviewState.page} total={reviewState.total} onChange={(page) => void loadPagedData('sheet-reviews', page)} />
    </>
  )
}
