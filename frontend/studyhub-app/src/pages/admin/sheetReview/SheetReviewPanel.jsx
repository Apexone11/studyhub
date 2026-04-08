/* ═══════════════════════════════════════════════════════════════════════════
 * SheetReviewPanel.jsx — Side-by-side HTML sheet review for admins
 *
 * Left:  Sandboxed iframe preview (safe HTML only — never raw)
 * Right: Raw HTML as plain text + scan findings + approve/reject with reason
 *
 * Security invariants:
 *   - iframe sandbox="" (strictest — no scripts, no same-origin)
 *   - Raw HTML is ONLY rendered via <pre> as text, never interpreted
 *   - sanitizedHtml comes from the same sanitize-html pipeline users see
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../../config'
import { getApiErrorMessage, readJsonSafely } from '../../../lib/http'
import { FONT, overlayStyle, panelStyle, closeBtnStyle } from './sheetReviewConstants'
import { SanitizedPreview, InteractivePreview, RawHtmlView, FindingsPanel, ReviewActionBar } from './SheetReviewDetails'

export default function SheetReviewPanel({ sheetId, onClose, onReviewComplete }) {
  const [state, setState] = useState({ loading: true, error: '', detail: null })
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitEnrichedIssues, setSubmitEnrichedIssues] = useState([])
  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'interactive' | 'raw' | 'findings'
  const [aiReviewing, setAiReviewing] = useState(false)
  const [scrollToLine, setScrollToLine] = useState(0)
  const [interactiveState, setInteractiveState] = useState({ loading: false, error: '', runtimeUrl: '', attempted: false })
  const iframeRef = useRef(null)

  const loadDetail = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/admin/sheets/${sheetId}/review-detail`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load review detail.'))
      }

      setState({ loading: false, error: '', detail: data })
    } catch (err) {
      setState({ loading: false, error: err.message || 'Could not load review detail.', detail: null })
    }
  }, [sheetId])

  useEffect(() => {
    setState({ loading: true, error: '', detail: null })
    setInteractiveState({ loading: false, error: '', runtimeUrl: '', attempted: false })
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!state.detail || state.detail.contentFormat !== 'html' || activeTab !== 'interactive') return
    if (interactiveState.loading || interactiveState.runtimeUrl || interactiveState.attempted) return

    let cancelled = false

    async function loadInteractivePreview() {
      setInteractiveState({ loading: true, error: '', runtimeUrl: '', attempted: true })

      try {
        const response = await fetch(`${API}/api/sheets/${sheetId}/html-runtime`, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
        const data = await readJsonSafely(response, {})

        if (!response.ok) {
          throw new Error(getApiErrorMessage(data, 'Could not load interactive preview.'))
        }

        if (cancelled) return
        setInteractiveState({ loading: false, error: '', runtimeUrl: data.runtimeUrl || '', attempted: true })
      } catch (err) {
        if (cancelled) return
        setInteractiveState({ loading: false, error: err.message || 'Could not load interactive preview.', runtimeUrl: '', attempted: true })
      }
    }

    void loadInteractivePreview()
    return () => { cancelled = true }
  }, [activeTab, interactiveState.attempted, interactiveState.loading, interactiveState.runtimeUrl, sheetId, state.detail])

  async function handleReview(action, quickReason) {
    const finalReason = quickReason || reason.trim()

    setSubmitting(true)
    setSubmitError('')
    setSubmitEnrichedIssues([])

    try {
      const response = await fetch(`${API}/api/admin/sheets/${sheetId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, reason: finalReason }),
      })
      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        if (Array.isArray(data.enrichedIssues)) setSubmitEnrichedIssues(data.enrichedIssues)
        throw new Error(getApiErrorMessage(data, `Could not ${action} sheet.`))
      }

      if (onReviewComplete) onReviewComplete(action, data)
    } catch (err) {
      setSubmitError(err.message || `Could not ${action} sheet.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAiReReview() {
    setAiReviewing(true)
    try {
      const response = await fetch(`${API}/api/admin/sheets/${sheetId}/ai-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await readJsonSafely(response, {})
        throw new Error(data.error || 'AI re-review failed')
      }
      // Reload the detail to show updated AI review data
      await loadDetail()
      setActiveTab('findings')
    } catch (err) {
      setSubmitError(err.message || 'AI re-review failed')
    } finally {
      setAiReviewing(false)
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
  const runtimeValidation = d.runtimeValidation || null
  const highlightedLines = runtimeValidation?.enrichedIssues?.map((i) => i.line).filter(Boolean) || []

  function handleJumpToLine(line) {
    setActiveTab('raw')
    setScrollToLine(0) // reset first to re-trigger even if same line
    setTimeout(() => setScrollToLine(line), 50)
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--sh-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
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
          {/* Risk summary bar */}
          {isHtml && (d.htmlRiskTier > 0 || d.liveRiskTier > 0) && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
              {d.htmlRiskTier > 0 && (
                <span style={{ fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: d.htmlRiskTier >= 3 ? 'var(--sh-danger-bg)' : d.htmlRiskTier >= 2 ? 'var(--sh-warning-bg)' : 'var(--sh-warning-bg)', color: d.htmlRiskTier >= 3 ? 'var(--sh-danger)' : 'var(--sh-warning-text)', border: `1px solid ${d.htmlRiskTier >= 3 ? 'var(--sh-danger-border)' : 'var(--sh-warning-border)'}` }}>
                  Tier {d.htmlRiskTier}: {['Clean', 'Flagged', 'High Risk', 'Quarantined'][d.htmlRiskTier] || 'Unknown'}
                </span>
              )}
              {d.riskSummary && (
                <span style={{ color: 'var(--sh-subtext)', fontWeight: 600 }}>{d.riskSummary}</span>
              )}
              {d.htmlScanAcknowledgedAt && (
                <span style={{ fontWeight: 600, color: 'var(--sh-info-text)', background: 'var(--sh-info-bg)', border: '1px solid var(--sh-info-border)', padding: '2px 8px', borderRadius: 6 }}>
                  User acknowledged
                </span>
              )}
            </div>
          )}
          {isHtml && d.tierExplanation && d.htmlRiskTier > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--sh-muted)', lineHeight: 1.5 }}>
              {d.tierExplanation}
            </div>
          )}
          {/* AI review badge + re-review button */}
          {isHtml && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {d.aiReviewDecision && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: d.aiReviewDecision === 'approve' ? 'var(--sh-success-bg)' : d.aiReviewDecision === 'reject' ? 'var(--sh-danger-bg)' : 'var(--sh-warning-bg)',
                  color: d.aiReviewDecision === 'approve' ? 'var(--sh-success-text)' : d.aiReviewDecision === 'reject' ? 'var(--sh-danger-text)' : 'var(--sh-warning-text)',
                  border: `1px solid ${d.aiReviewDecision === 'approve' ? 'var(--sh-success-border)' : d.aiReviewDecision === 'reject' ? 'var(--sh-danger-border)' : 'var(--sh-warning-border)'}`,
                }}>
                  AI: {d.aiReviewDecision}{d.aiReviewConfidence ? ` (${d.aiReviewConfidence}%)` : ''}
                </span>
              )}
              <button
                type="button"
                onClick={handleAiReReview}
                disabled={aiReviewing}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--sh-border)',
                  background: 'var(--sh-surface)', color: 'var(--sh-subtext)', fontSize: 11,
                  fontWeight: 700, cursor: aiReviewing ? 'wait' : 'pointer', fontFamily: FONT,
                }}
              >
                {aiReviewing ? 'Running AI Review...' : 'AI Re-Review'}
              </button>
            </div>
          )}
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        {isHtml && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--sh-border)', padding: '0 20px' }}>
            {[['preview', 'Safe Preview'], ['interactive', 'Interactive Preview'], ['raw', 'Raw HTML (text)'], ['findings', `Findings (${findings.length})`]].map(([key, label]) => (
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
          {(activeTab === 'preview' && isHtml) && (
            <SanitizedPreview iframeRef={iframeRef} sheetId={sheetId} />
          )}

          {(activeTab === 'interactive' && isHtml) && (
            <InteractivePreview
              loading={interactiveState.loading}
              error={interactiveState.error}
              runtimeUrl={interactiveState.runtimeUrl}
              sheetId={sheetId}
            />
          )}

          {(activeTab === 'raw' && isHtml) && (
            <RawHtmlView rawHtml={d.rawHtml} highlightedLines={highlightedLines} scrollToLine={scrollToLine} />
          )}

          {(activeTab === 'findings' || !isHtml) && (
            <FindingsPanel findings={findings} detail={d} runtimeValidation={runtimeValidation} onJumpToLine={handleJumpToLine} />
          )}
        </div>

        {/* ── Action bar ──────────────────────────────────────────── */}
        <ReviewActionBar
          reason={reason}
          setReason={setReason}
          submitting={submitting}
          submitError={submitError}
          submitEnrichedIssues={submitEnrichedIssues}
          setSubmitError={setSubmitError}
          handleReview={handleReview}
          onJumpToLine={handleJumpToLine}
        />
      </div>
    </div>
  )
}
