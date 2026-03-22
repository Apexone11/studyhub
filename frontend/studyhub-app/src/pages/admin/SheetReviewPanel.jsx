/* ═══════════════════════════════════════════════════════════════════════════
 * SheetReviewPanel.jsx — Side-by-side HTML sheet review for admins
 *
 * Left:  Sandboxed iframe preview (sanitized HTML only — never raw)
 * Right: Raw HTML as plain text + scan findings + approve/reject with reason
 *
 * Security invariants:
 *   - iframe sandbox="" (strictest — no scripts, no same-origin)
 *   - Raw HTML is ONLY rendered via <pre> as text, never interpreted
 *   - sanitizedHtml comes from the same sanitize-html pipeline users see
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

function severityColor(severity) {
  if (severity === 'error' || severity === 'critical') return '#dc2626'
  if (severity === 'high') return '#ea580c'
  if (severity === 'warning') return '#d97706'
  return '#64748b'
}

export default function SheetReviewPanel({ sheetId, onClose, onReviewComplete }) {
  const { clearSession } = useSession()
  const [state, setState] = useState({ loading: true, error: '', detail: null })
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'raw' | 'findings'
  const iframeRef = useRef(null)

  const loadDetail = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/admin/sheets/${sheetId}/review-detail`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})

      if (response.status === 401) {
        clearSession()
        return
      }
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load review detail.'))
      }

      setState({ loading: false, error: '', detail: data })
    } catch (err) {
      setState({ loading: false, error: err.message || 'Could not load review detail.', detail: null })
    }
  }, [clearSession, sheetId])

  useEffect(() => {
    setState({ loading: true, error: '', detail: null })
    void loadDetail()
  }, [loadDetail])

  async function handleReview(action, quickReason) {
    const finalReason = quickReason || reason.trim()

    setSubmitting(true)
    setSubmitError('')

    try {
      const response = await fetch(`${API}/api/admin/sheets/${sheetId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, reason: finalReason }),
      })
      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, `Could not ${action} sheet.`))
      }

      if (onReviewComplete) onReviewComplete(action, data)
    } catch (err) {
      setSubmitError(err.message || `Could not ${action} sheet.`)
    } finally {
      setSubmitting(false)
    }
  }

  /* Write sanitized HTML into the sandboxed iframe via srcdoc-like blob */
  useEffect(() => {
    if (!state.detail?.sanitizedHtml || !iframeRef.current) return

    const fullDoc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    html, body { margin: 0; padding: 16px; background: #fff; color: #0f172a; }
    img, svg, video { max-width: 100%; height: auto; }
    table { max-width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>${state.detail.sanitizedHtml}</body>
</html>`

    const blob = new Blob([fullDoc], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    iframeRef.current.src = url

    return () => URL.revokeObjectURL(url)
  }, [state.detail?.sanitizedHtml])

  if (state.loading) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 14 }}>Loading review detail...</div>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ padding: 24 }}>
            <div style={{ color: 'var(--sh-danger)', fontSize: 14, marginBottom: 16 }}>{state.error}</div>
            <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  const d = state.detail
  const findings = [
    ...(d.validationIssues || []).map((msg) => ({ source: 'policy', severity: 'error', message: msg })),
    ...(Array.isArray(d.htmlScanFindings) ? d.htmlScanFindings : []),
  ]
  const isHtml = d.contentFormat === 'html'

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--sh-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
              Review: {d.title}
            </h2>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--sh-muted)' }}>
              {d.course?.code || 'No course'} · by {d.author?.username || 'unknown'} · {d.contentFormat} · {d.status}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        {isHtml && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--sh-border)', padding: '0 20px' }}>
            {[['preview', 'Sanitized Preview'], ['raw', 'Raw HTML (text)'], ['findings', `Findings (${findings.length})`]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '10px 16px', border: 'none', background: 'none',
                  fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                  color: activeTab === key ? 'var(--sh-link)' : 'var(--sh-muted)',
                  borderBottom: activeTab === key ? '2px solid var(--sh-brand)' : '2px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Content area ────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {/* Sanitized preview (iframe) */}
          {(activeTab === 'preview' && isHtml) && (
            <div style={{ height: '100%', minHeight: 400 }}>
              <iframe
                ref={iframeRef}
                title={`admin-review-preview-${sheetId}`}
                sandbox=""
                referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', minHeight: 400, border: 'none', background: '#fff' }}
              />
            </div>
          )}

          {/* Raw HTML as text (NEVER interpreted) */}
          {(activeTab === 'raw' && isHtml) && (
            <div style={{ padding: 16, position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  if (d.rawHtml) navigator.clipboard.writeText(d.rawHtml)
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
                {d.rawHtml || '(no HTML content)'}
              </pre>
            </div>
          )}

          {/* Findings panel */}
          {(activeTab === 'findings' || !isHtml) && (
            <div style={{ padding: 16 }}>
              {findings.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-success)', fontSize: 13, fontWeight: 700 }}>
                  No security findings. Content passed all checks.
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
          )}
        </div>

        {/* ── Action bar ──────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--sh-border)', background: 'var(--sh-soft)' }}>
          {submitError && (
            <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger)', fontSize: 12 }}>
              {submitError}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--sh-text)' }}>
            Review reason (optional — defaults applied if empty)
          </label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setSubmitError('') }}
            placeholder="Explain your decision (e.g. 'Content is clean, no security issues found' or 'Contains obfuscated script injection in img tags')"
            rows={3}
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
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const panelStyle = {
  width: 'min(95vw, 960px)', maxHeight: '90vh',
  background: 'var(--sh-surface)', borderRadius: 20,
  border: '1px solid var(--sh-border)',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: FONT,
}

const closeBtnStyle = {
  padding: '7px 14px', borderRadius: 8,
  border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
  color: 'var(--sh-subtext)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  fontFamily: FONT,
}
