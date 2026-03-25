/* ═══════════════════════════════════════════════════════════════════════════
 * SheetReviewDetails.jsx — Sub-components for sheet review content display
 *
 * Extracted from SheetReviewPanel.jsx.  Contains:
 *   - SanitizedPreview  (sandboxed iframe)
 *   - RawHtmlView       (plain-text <pre> — never interpreted)
 *   - FindingsPanel     (scan findings + metadata)
 *   - ReviewActionBar   (approve / reject controls)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef } from 'react'
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

/* ── Raw HTML as text (NEVER interpreted) with line highlighting ────────── */

export function RawHtmlView({ rawHtml, highlightedLines, scrollToLine }) {
  const containerRef = useRef(null)
  const highlightSet = useMemo(() => new Set(Array.isArray(highlightedLines) ? highlightedLines : []), [highlightedLines])
  const lines = (rawHtml || '(no HTML content)').split('\n')

  /* Scroll to target line after render */
  useEffect(() => {
    const el = containerRef.current
    if (!el || scrollToLine <= 0) return
    const target = el.querySelector(`[data-line="${scrollToLine}"]`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.style.transition = 'background 0.3s'
      target.style.background = '#fef08a'
      const isHighlighted = highlightSet.has(scrollToLine)
      setTimeout(() => { target.style.background = isHighlighted ? '#fef3c7' : '' }, 1500)
    }
  }, [scrollToLine, highlightSet])

  return (
    <div style={{ padding: 16, position: 'relative' }}>
      <button
        type="button"
        onClick={() => { if (rawHtml) navigator.clipboard.writeText(rawHtml) }}
        style={{
          position: 'absolute', top: 24, right: 24, padding: '5px 10px', zIndex: 2,
          borderRadius: 6, border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', color: 'var(--sh-subtext)', fontFamily: FONT,
        }}
      >
        Copy raw
      </button>
      <div
        ref={containerRef}
        style={{
          margin: 0, borderRadius: 10, background: 'var(--sh-soft)', overflow: 'auto',
          maxHeight: 500, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
        }}
      >
        {lines.map((line, idx) => {
          const lineNum = idx + 1
          const isHighlighted = highlightSet.has(lineNum)
          return (
            <div
              key={idx}
              data-line={lineNum}
              style={{
                display: 'flex',
                background: isHighlighted ? '#fef3c7' : 'transparent',
                borderLeft: isHighlighted ? '3px solid #f59e0b' : '3px solid transparent',
              }}
            >
              <span style={{
                display: 'inline-block', width: 44, flexShrink: 0, textAlign: 'right',
                paddingRight: 10, color: isHighlighted ? '#92400e' : 'var(--sh-muted)',
                userSelect: 'none', fontWeight: isHighlighted ? 700 : 400,
              }}>
                {lineNum}
              </span>
              <span style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1, padding: '0 8px',
                color: isHighlighted ? '#78350f' : 'var(--sh-text)',
                fontWeight: isHighlighted ? 600 : 400,
              }}>
                {line}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Findings panel ──────────────────────────────────────────────────────── */

export function FindingsPanel({ findings, detail, runtimeValidation, onJumpToLine }) {
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

      {/* Runtime validation — enriched issues with line locations */}
      {runtimeValidation && !runtimeValidation.ok && Array.isArray(runtimeValidation.enrichedIssues) && runtimeValidation.enrichedIssues.length > 0 && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>
            Blocked from publishing — remote assets detected:
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {runtimeValidation.enrichedIssues.map((issue, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
                {issue.line ? (
                  <button
                    type="button"
                    onClick={() => onJumpToLine && onJumpToLine(issue.line)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: '#2563eb', fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
                      textDecoration: 'underline', flexShrink: 0,
                    }}
                  >
                    Line {issue.line}
                  </button>
                ) : null}
                <span style={{ color: '#7f1d1d' }}>
                  {issue.url ? (
                    <code style={{ fontSize: 11, background: '#fee2e2', padding: '1px 4px', borderRadius: 3, wordBreak: 'break-all' }}>
                      {issue.url}
                    </code>
                  ) : issue.message}
                </span>
              </div>
            ))}
          </div>
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
                  <li key={i}>
                    {f.message || String(f)}
                    {f.line && onJumpToLine ? (
                      <button
                        type="button"
                        onClick={() => onJumpToLine(f.line)}
                        style={{ background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', color: '#2563eb', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', textDecoration: 'underline' }}
                      >
                        :L{f.line}
                      </button>
                    ) : null}
                  </li>
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

export function ReviewActionBar({ reason, setReason, submitting, submitError, submitEnrichedIssues, setSubmitError, handleReview, onJumpToLine }) {
  return (
    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--sh-border)', background: 'var(--sh-soft)' }}>
      {submitError && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger)', fontSize: 12 }}>
          {submitError}
          {Array.isArray(submitEnrichedIssues) && submitEnrichedIssues.length > 0 && (
            <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
              {submitEnrichedIssues.map((issue, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11 }}>
                  {issue.line && onJumpToLine ? (
                    <button
                      type="button"
                      onClick={() => onJumpToLine(issue.line)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563eb', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', textDecoration: 'underline', flexShrink: 0 }}
                    >
                      Line {issue.line}
                    </button>
                  ) : null}
                  {issue.url ? (
                    <code style={{ fontSize: 10, wordBreak: 'break-all' }}>{issue.url}</code>
                  ) : (
                    <span>{issue.message}</span>
                  )}
                </div>
              ))}
            </div>
          )}
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
