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
import { FONT, overlayStyle, panelStyle, closeBtnStyle } from './sheetReviewConstants'
import { SanitizedPreview, RawHtmlView, FindingsPanel, ReviewActionBar } from './SheetReviewDetails'

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
          {(activeTab === 'preview' && isHtml) && (
            <SanitizedPreview iframeRef={iframeRef} sheetId={sheetId} />
          )}

          {(activeTab === 'raw' && isHtml) && (
            <RawHtmlView rawHtml={d.rawHtml} />
          )}

          {(activeTab === 'findings' || !isHtml) && (
            <FindingsPanel findings={findings} detail={d} />
          )}
        </div>

        {/* ── Action bar ──────────────────────────────────────────── */}
        <ReviewActionBar
          reason={reason}
          setReason={setReason}
          submitting={submitting}
          submitError={submitError}
          setSubmitError={setSubmitError}
          handleReview={handleReview}
        />
      </div>
    </div>
  )
}
