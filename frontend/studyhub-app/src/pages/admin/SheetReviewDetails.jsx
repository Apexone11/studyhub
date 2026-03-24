/* ═══════════════════════════════════════════════════════════════════════════
 * SheetReviewDetails.jsx — Sub-components for sheet review content display
 *
 * Extracted from SheetReviewPanel.jsx.  Contains:
 *   - SanitizedPreview  (sandboxed iframe)
 *   - RawHtmlView       (plain-text <pre> — never interpreted)
 *   - FindingsPanel     (scan findings + metadata)
 *   - ReviewActionBar   (approve / reject controls)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { FONT, formatDateTime, severityColor } from './sheetReviewConstants'

/* ── Safe preview (iframe) ───────────────────────────────────────────────── */

export function SanitizedPreview({ iframeRef, sheetId }) {
  return (
    <div style={{ height: '100%', minHeight: 400 }}>
      <iframe
        ref={iframeRef}
        title={`admin-review-preview-${sheetId}`}
        sandbox=""
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: '100%', minHeight: 400, border: 'none', background: '#fff' }}
      />
    </div>
  )
}

/* ── Raw HTML as text (NEVER interpreted) ────────────────────────────────── */

export function RawHtmlView({ rawHtml }) {
  return (
    <div style={{ padding: 16, position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          if (rawHtml) navigator.clipboard.writeText(rawHtml)
        }}
        style={{
          position: 'absolute', top: 24, right: 24, padding: '5px 10px',
          borderRadius: 6, border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', color: 'var(--sh-subtext)', fontFamily: FONT,
        }}
      >
        Copy raw
      </button>
      <pre style={{
        margin: 0, padding: 16, borderRadius: 10, background: 'var(--sh-soft)', color: 'var(--sh-text)',
        fontSize: 12, lineHeight: 1.6, overflow: 'auto', maxHeight: 500,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
      }}>
        {rawHtml || '(no HTML content)'}
      </pre>
    </div>
  )
}

/* ── Findings panel ──────────────────────────────────────────────────────── */

export function FindingsPanel({ findings, detail }) {
  const d = detail
  const groupedFindings = d.findingsByCategory || d.liveFindingsByCategory || null
  const hasGroups = groupedFindings && Object.keys(groupedFindings).length > 0

  return (
    <div style={{ padding: 16 }}>
      {/* Risk summary */}
      {d.riskSummary && d.htmlRiskTier > 0 && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: d.htmlRiskTier >= 3 ? 'var(--sh-danger)' : 'var(--sh-warning-text)' }}>
          {d.riskSummary}
        </div>
      )}

      {findings.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-success)', fontSize: 13, fontWeight: 700 }}>
          No security findings. Content passed all checks.
        </div>
      ) : hasGroups ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {Object.entries(groupedFindings).sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2 }
            return (order[a[1].maxSeverity] ?? 3) - (order[b[1].maxSeverity] ?? 3)
          }).map(([category, group]) => (
            <div key={category} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${severityColor(group.maxSeverity)}20`, background: `${severityColor(group.maxSeverity)}08` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: severityColor(group.maxSeverity) }}>
                  {group.maxSeverity}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-heading)' }}>
                  {group.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--sh-muted)' }}>
                  ({group.findings.length})
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--sh-text)', lineHeight: 1.7 }}>
                {group.findings.map((f, i) => (
                  <li key={i}>{f.message || String(f)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {findings.map((finding, index) => (
            <div
              key={index}
              style={{
                padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${severityColor(finding.severity)}20`,
                background: `${severityColor(finding.severity)}08`,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                  color: severityColor(finding.severity),
                }}>
                  {finding.severity || 'info'}
                </span>
                {finding.source && (
                  <span style={{ fontSize: 10, color: 'var(--sh-muted)' }}>({finding.source})</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.6 }}>
                {finding.message || String(finding)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scan metadata */}
      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.8 }}>
        <div><strong>Scan status:</strong> {d.htmlScanStatus}</div>
        <div><strong>User acknowledged findings:</strong> {d.htmlScanAcknowledgedAt ? formatDateTime(d.htmlScanAcknowledgedAt) : 'No'}</div>
        <div><strong>Submitted:</strong> {formatDateTime(d.createdAt)}</div>
        <div><strong>Last updated:</strong> {formatDateTime(d.updatedAt)}</div>
        {d.reviewedBy && (
          <>
            <div><strong>Previously reviewed by:</strong> {d.reviewedBy.username}</div>
            <div><strong>Review date:</strong> {formatDateTime(d.reviewedAt)}</div>
            <div><strong>Reason:</strong> {d.reviewReason || '—'}</div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Action bar ──────────────────────────────────────────────────────────── */

const REASON_TEMPLATES = [
  'Allowed advanced HTML; safe preview only.',
  'Pending due to obfuscated script behavior.',
  'Quarantined due to phishing/exfiltration indicators.',
  'Rejected — content violates community guidelines.',
  'Content is clean, no security issues found.',
]

export function ReviewActionBar({ reason, setReason, submitting, submitError, setSubmitError, handleReview }) {
  return (
    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--sh-border)', background: 'var(--sh-soft)' }}>
      {submitError && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger)', fontSize: 12 }}>
          {submitError}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--sh-text)' }}>
        Review reason (optional — defaults applied if empty)
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {REASON_TEMPLATES.map((template) => (
          <button
            key={template}
            type="button"
            onClick={() => { setReason(template); setSubmitError('') }}
            style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid var(--sh-border)',
              background: reason === template ? 'var(--sh-brand)' : 'var(--sh-surface)',
              color: reason === template ? '#fff' : 'var(--sh-muted)',
              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
            }}
          >
            {template}
          </button>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={(e) => { setReason(e.target.value); setSubmitError('') }}
        placeholder="Explain your decision or pick a template above"
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
          border: '1px solid var(--sh-input-border)', fontSize: 13, fontFamily: FONT, resize: 'vertical',
          color: 'var(--sh-heading)', outline: 'none',
        }}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleReview('approve')}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, var(--sh-success), #059669)',
            color: 'var(--sh-btn-primary-text)', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1, fontFamily: FONT,
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
          }}
        >
          {submitting ? 'Submitting...' : 'Approve & Publish'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleReview('reject')}
          style={{
            padding: '10px 20px', borderRadius: 10,
            border: '1px solid var(--sh-danger-border)', background: 'var(--sh-surface)',
            color: 'var(--sh-danger)', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1, fontFamily: FONT,
          }}
        >
          Reject
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleReview('reject', 'Rejected by admin (quick reject).')}
          style={{
            padding: '10px 20px', borderRadius: 10,
            border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
            color: 'var(--sh-muted)', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1, fontFamily: FONT,
          }}
        >
          Quick Reject
        </button>
      </div>
    </div>
  )
}
