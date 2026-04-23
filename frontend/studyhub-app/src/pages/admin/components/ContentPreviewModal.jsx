import { useState, useEffect } from 'react'
import { API } from '../../../config'
import AdminModal from './AdminModal'
import AdminSplitPanel from './AdminSplitPanel'
import { AdminPill } from './index'
import { ExternalLinkIcon } from './icons'
import { formatDateTime, formatLabel } from '../adminConstants'
import './admin-primitives.css'

function ContentPane({ preview }) {
  if (!preview) return <div className="admin-loading">Loading preview...</div>

  return (
    <div>
      {preview.linkPath && (
        <a
          href={preview.linkPath}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--sh-brand)',
            textDecoration: 'none',
            marginBottom: 16,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <ExternalLinkIcon size={14} /> View on site
        </a>
      )}

      {preview.title && (
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            margin: '0 0 8px',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {preview.title}
        </h3>
      )}

      {preview.text && (
        <div
          style={{
            fontSize: 14,
            color: 'var(--sh-text)',
            lineHeight: 1.6,
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {preview.text}
        </div>
      )}

      {preview.attachments && preview.attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {preview.attachments.map((att, i) => {
            if (att.kind === 'image') {
              return (
                <img
                  key={i}
                  src={`${API}${att.previewUrl || att.url}`}
                  alt="Attachment"
                  loading="lazy"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 400,
                    borderRadius: 10,
                    border: '1px solid var(--sh-border)',
                    objectFit: 'contain',
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
              )
            }
            if (att.kind === 'pdf') {
              return (
                <iframe
                  key={i}
                  src={`${API}${att.url}`}
                  title="PDF Preview"
                  style={{
                    width: '100%',
                    height: 400,
                    borderRadius: 10,
                    border: '1px solid var(--sh-border)',
                  }}
                />
              )
            }
            return (
              <div
                key={i}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--sh-border)',
                  background: 'var(--sh-soft)',
                  fontSize: 13,
                  color: 'var(--sh-subtext)',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Attachment: {att.filename || 'file'} ({att.kind})
              </div>
            )
          })}
        </div>
      )}

      {preview.owner && (
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: 'var(--sh-muted)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          By @{preview.owner.username} · {formatDateTime(preview.createdAt)}
        </div>
      )}
    </div>
  )
}

function ContextPane({ caseData, onConfirm, onDismiss, onIssueStrike }) {
  if (!caseData) return <div className="admin-loading">Loading case...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Reported User</span>
        <span className="admin-detail-row__value">{caseData.user?.username || '\u2014'}</span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Reported By</span>
        <span className="admin-detail-row__value">{caseData.reporter?.username || 'System'}</span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Category</span>
        <span className="admin-detail-row__value">
          {formatLabel(caseData.reasonCategory, '\u2014')}
        </span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Source</span>
        <span className="admin-detail-row__value">
          <AdminPill status={caseData.source === 'auto' ? 'info' : 'pending'}>
            {formatLabel(caseData.source)}
          </AdminPill>
        </span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Status</span>
        <span className="admin-detail-row__value">
          <AdminPill status={caseData.status}>{formatLabel(caseData.status)}</AdminPill>
        </span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Confidence</span>
        <span className="admin-detail-row__value">
          {caseData.confidence != null ? `${(caseData.confidence * 100).toFixed(0)}%` : '\u2014'}
        </span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Created</span>
        <span className="admin-detail-row__value">{formatDateTime(caseData.createdAt)}</span>
      </div>

      {caseData.excerpt && (
        <div className="admin-detail-row">
          <span className="admin-detail-row__label">Reporter Note</span>
          <span className="admin-detail-row__value" style={{ fontSize: 13, fontStyle: 'italic' }}>
            {caseData.excerpt}
          </span>
        </div>
      )}

      {caseData.strikes && caseData.strikes.length > 0 && (
        <div className="admin-detail-row">
          <span className="admin-detail-row__label">Linked Strikes</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {caseData.strikes.map((s) => (
              <AdminPill key={s.id} status={s.decayedAt ? 'decayed' : 'active'}>
                Strike #{s.id} {s.decayedAt ? '(Decayed)' : '(Active)'}
              </AdminPill>
            ))}
          </div>
        </div>
      )}

      {caseData.appeals && caseData.appeals.length > 0 && (
        <div className="admin-detail-row">
          <span className="admin-detail-row__label">Linked Appeals</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {caseData.appeals.map((a) => (
              <AdminPill key={a.id} status={a.status}>
                Appeal #{a.id} ({formatLabel(a.status)})
              </AdminPill>
            ))}
          </div>
        </div>
      )}

      {caseData.status === 'pending' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          <button className="admin-btn admin-btn--danger" onClick={onConfirm}>
            Confirm Violation
          </button>
          <button className="admin-btn admin-btn--ghost" onClick={onDismiss}>
            Dismiss
          </button>
          <button className="admin-btn admin-btn--primary" onClick={onIssueStrike}>
            Issue Strike
          </button>
        </div>
      )}

      {caseData.status === 'confirmed' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          <button className="admin-btn admin-btn--primary" onClick={onIssueStrike}>
            Issue Strike
          </button>
        </div>
      )}
    </div>
  )
}

export default function ContentPreviewModal({
  open,
  onClose,
  caseId,
  onConfirm,
  onDismiss,
  onIssueStrike,
}) {
  const [caseData, setCaseData] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !caseId) return
    const opts = { credentials: 'include' }
    async function load() {
      setLoading(true)
      setCaseData(null)
      setPreview(null)
      try {
        const [c, p] = await Promise.all([
          fetch(`${API}/api/admin/moderation/cases/${caseId}`, opts).then((r) => r.json()),
          fetch(`${API}/api/admin/moderation/cases/${caseId}/preview`, opts).then((r) => r.json()),
        ])
        setCaseData(c)
        setPreview(p)
      } catch {
        // silently ignore fetch errors
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, caseId])

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={`Case #${caseId || ''} \u2014 Reported Content`}
      size="xl"
    >
      {loading ? (
        <div className="admin-loading" style={{ minHeight: 300 }}>
          Loading case details...
        </div>
      ) : (
        <AdminSplitPanel
          left={<ContentPane preview={preview} caseData={caseData} />}
          right={
            <ContextPane
              caseData={caseData}
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onIssueStrike={onIssueStrike}
            />
          }
        />
      )}
    </AdminModal>
  )
}
