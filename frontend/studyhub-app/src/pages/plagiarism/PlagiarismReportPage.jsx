/* ═══════════════════════════════════════════════════════════════════════════
 * PlagiarismReportPage.jsx — View plagiarism scan results for a sheet
 * Route: /sheets/:id/plagiarism (authenticated, author or admin)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { Skeleton, SkeletonList } from '../../components/Skeleton'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useSession } from '../../lib/session-context'
import useFetch from '../../lib/useFetch'
import { API } from '../../config'
import { usePageTitle } from '../../lib/usePageTitle'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* ── helpers ─────────────────────────────────────────────────────────────── */

function pct(v) {
  return Math.round((v ?? 0) * 100)
}

function severityColor(score) {
  if (score >= 0.85)
    return {
      fg: 'var(--sh-danger-text)',
      bg: 'var(--sh-danger-bg)',
      border: 'var(--sh-danger-border)',
      label: 'High',
    }
  if (score >= 0.7)
    return {
      fg: 'var(--sh-warning-text)',
      bg: 'var(--sh-warning-bg)',
      border: 'var(--sh-warning-border)',
      label: 'Medium',
    }
  return {
    fg: 'var(--sh-success-text)',
    bg: 'var(--sh-success-bg)',
    border: 'var(--sh-success-border)',
    label: 'Low',
  }
}

function matchLabel(type) {
  const map = {
    exact: 'Exact Match',
    simhash: 'Structural Similarity',
    ngram: 'Content Overlap',
    ai: 'AI Detected',
  }
  return map[type] || type
}

function statusBadge(status) {
  const map = {
    pending: {
      bg: 'var(--sh-warning-bg)',
      color: 'var(--sh-warning-text)',
      border: 'var(--sh-warning-border)',
    },
    confirmed: {
      bg: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger-text)',
      border: 'var(--sh-danger-border)',
    },
    dismissed: {
      bg: 'var(--sh-success-bg)',
      color: 'var(--sh-success-text)',
      border: 'var(--sh-success-border)',
    },
    disputed: {
      bg: 'var(--sh-info-bg)',
      color: 'var(--sh-info-text)',
      border: 'var(--sh-info-border)',
    },
  }
  return map[status] || map.pending
}

/* ── Gauge (donut-style) ─────────────────────────────────────────────────── */

function SimilarityGauge({ score }) {
  const size = 120
  const stroke = 10
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score)
  const sev = severityColor(score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sh-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={sev.fg}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span style={{ fontSize: 28, fontWeight: 800, color: sev.fg, marginTop: -76 }}>
        {pct(score)}%
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: sev.bg,
          color: sev.fg,
          border: `1px solid ${sev.border}`,
          marginTop: 20,
        }}
      >
        {sev.label} similarity
      </span>
    </div>
  )
}

/* ── Score bar ───────────────────────────────────────────────────────────── */

function ScoreBar({ label, value }) {
  const p = pct(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--sh-muted)', width: 90, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--sh-soft)' }}>
        <div
          style={{
            width: `${p}%`,
            height: '100%',
            borderRadius: 3,
            background: severityColor(value).fg,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--sh-heading)',
          width: 36,
          textAlign: 'right',
        }}
      >
        {p}%
      </span>
    </div>
  )
}

/* ── Report card ─────────────────────────────────────────────────────────── */

function ReportCard({ report, onDispute }) {
  const sev = severityColor(report.similarityScore)
  const st = statusBadge(report.status)
  const scores = report.scores || {}

  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 14,
        border: `1px solid ${sev.border}`,
        padding: 'clamp(16px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {report.matchedSheet?.author && (
            <UserAvatar user={report.matchedSheet.author} size={32} />
          )}
          <div style={{ minWidth: 0 }}>
            <Link
              to={`/sheets/${report.matchedSheet?.id}`}
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--sh-heading)',
                textDecoration: 'none',
              }}
            >
              {report.matchedSheet?.title || 'Unknown sheet'}
            </Link>
            {report.matchedSheet?.author && (
              <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
                by {report.matchedSheet.author.username}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: st.bg,
              color: st.color,
              border: `1px solid ${st.border}`,
            }}
          >
            {report.status}
          </span>
          <span
            style={{
              display: 'inline-flex',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: 'var(--sh-soft)',
              color: 'var(--sh-muted)',
              border: '1px solid var(--sh-border)',
            }}
          >
            {matchLabel(report.matchType)}
          </span>
        </div>
      </div>

      {/* Score breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: sev.fg }}>
            {pct(report.similarityScore)}%
          </span>
          <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>overall similarity</span>
        </div>
        {scores.simhash != null && <ScoreBar label="SimHash" value={scores.simhash} />}
        {scores.ngram2 != null && <ScoreBar label="2-gram" value={scores.ngram2} />}
        {scores.ngram3 != null && <ScoreBar label="3-gram" value={scores.ngram3} />}
        {scores.structural != null && <ScoreBar label="Structure" value={scores.structural} />}
      </div>

      {/* AI verdict */}
      {report.aiVerdict && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--sh-info-bg)',
            border: '1px solid var(--sh-info-border)',
            fontSize: 13,
            color: 'var(--sh-info-text)',
            lineHeight: 1.5,
          }}
        >
          <strong>AI Analysis:</strong> {report.aiVerdict}
        </div>
      )}

      {/* Dispute button (only for pending reports) */}
      {report.status === 'pending' && (
        <button
          onClick={() => onDispute(report.id)}
          style={{
            alignSelf: 'flex-start',
            padding: '7px 16px',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            color: 'var(--sh-heading)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          Dispute this match
        </button>
      )}
    </div>
  )
}

/* ── Dispute modal (inline) ──────────────────────────────────────────────── */

function DisputeForm({ reportId, sheetId, onClose, onFiled }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (reason.trim().length < 10) {
      setError('Please provide at least 10 characters explaining why this is original work.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/plagiarism/sheet/${sheetId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reportId, reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not file dispute.')
      onFiled(reportId)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 14,
        border: '1px solid var(--sh-info-border)',
        padding: 'clamp(16px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)' }}>
        File a dispute
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.5 }}>
        Explain why this match is a false positive and your content is original.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="This is original work because..."
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-bg)',
            color: 'var(--sh-heading)',
            fontSize: 13,
            fontFamily: FONT,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ fontSize: 12, color: 'var(--sh-danger-text)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--sh-accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
              fontFamily: FONT,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit dispute'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function PlagiarismReportPage() {
  const { id } = useParams()
  const layout = useResponsiveAppLayout()
  useSession()
  usePageTitle('Plagiarism Report')

  const { data, loading, error, refetch } = useFetch(id ? `/api/plagiarism/sheet/${id}` : null, {
    swr: 30_000,
  })

  const [disputeTarget, setDisputeTarget] = useState(null)
  const [rescanning, setRescanning] = useState(false)
  const [rescanMsg, setRescanMsg] = useState('')

  const handleDispute = useCallback((reportId) => setDisputeTarget(reportId), [])
  const handleDisputeFiled = useCallback(() => {
    setDisputeTarget(null)
    refetch()
  }, [refetch])

  async function handleRescan() {
    setRescanning(true)
    setRescanMsg('')
    try {
      const res = await fetch(`${API}/api/plagiarism/sheet/${id}/rescan`, {
        method: 'POST',
        credentials: 'include',
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Rescan failed.')
      setRescanMsg('Rescan started. Results will update shortly.')
      setTimeout(refetch, 3000)
    } catch (err) {
      setRescanMsg(err.message)
    } finally {
      setRescanning(false)
    }
  }

  /* ── Breadcrumbs ───────────────────────────────────────────────────── */
  const crumbs = [
    { label: 'Sheets', to: '/sheets' },
    ...(data?.sheetTitle ? [{ label: data.sheetTitle, to: `/sheets/${id}` }] : []),
    { label: 'Plagiarism Report' },
  ]

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div
      className="sh-app-page"
      style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}
    >
      <Navbar crumbs={crumbs} hideTabs />
      <div
        className="app-two-col-grid sh-ambient-grid sh-ambient-shell"
        style={{ ...pageShell('app'), gap: 20 }}
      >
        <AppSidebar mode={layout.sidebarMode} />

        <main
          className="sh-ambient-main"
          id="main-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            paddingTop: 8,
          }}
        >
          {/* Loading state */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Skeleton height={24} width={200} />
              <Skeleton height={120} />
              <SkeletonList count={3} />
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div
              style={{
                padding: 24,
                borderRadius: 14,
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: 'var(--sh-danger-text)' }}>{error}</p>
            </div>
          )}

          {/* No reports / clean sheet */}
          {data && data.totalMatches === 0 && !loading && (
            <div
              style={{
                padding: 'clamp(32px, 5vw, 48px)',
                borderRadius: 14,
                background: 'var(--sh-success-bg)',
                border: '1px solid var(--sh-success-border)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--sh-success-text)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2
                style={{
                  margin: '0 0 8px',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--sh-success-text)',
                }}
              >
                All clear
              </h2>
              <p
                style={{ margin: 0, fontSize: 14, color: 'var(--sh-success-text)', opacity: 0.85 }}
              >
                No plagiarism matches were found for this sheet.
              </p>
            </div>
          )}

          {/* Reports exist */}
          {data && data.totalMatches > 0 && !loading && (
            <>
              {/* Summary card */}
              <div
                style={{
                  background: 'var(--sh-surface)',
                  borderRadius: 14,
                  border: '1px solid var(--sh-border)',
                  padding: 'clamp(20px, 4vw, 32px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'clamp(20px, 4vw, 40px)',
                  flexWrap: 'wrap',
                }}
              >
                <SimilarityGauge score={data.highestScore} />

                <div
                  style={{
                    flex: 1,
                    minWidth: 180,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <h1
                    style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}
                  >
                    Plagiarism Report
                  </h1>
                  <div style={{ fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
                    <strong>{data.totalMatches}</strong> match{data.totalMatches === 1 ? '' : 'es'}{' '}
                    found for{' '}
                    <Link
                      to={`/sheets/${id}`}
                      style={{ color: 'var(--sh-accent)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {data.sheetTitle}
                    </Link>
                  </div>
                  {data.hasLikelyCopy && (
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        background: 'var(--sh-danger-bg)',
                        border: '1px solid var(--sh-danger-border)',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--sh-danger-text)',
                      }}
                    >
                      High-similarity content detected. Please review the matches below and dispute
                      any false positives.
                    </div>
                  )}

                  {/* Rescan button */}
                  <button
                    onClick={handleRescan}
                    disabled={rescanning}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 18px',
                      borderRadius: 8,
                      border: '1px solid var(--sh-border)',
                      background: 'var(--sh-surface)',
                      color: 'var(--sh-heading)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: rescanning ? 'wait' : 'pointer',
                      fontFamily: FONT,
                      opacity: rescanning ? 0.6 : 1,
                      marginTop: 4,
                    }}
                  >
                    {rescanning ? 'Rescanning...' : 'Rescan after revision'}
                  </button>
                  {rescanMsg && (
                    <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>{rescanMsg}</div>
                  )}
                </div>
              </div>

              {/* Dispute form (shown when user clicks "Dispute" on a report) */}
              {disputeTarget && (
                <DisputeForm
                  reportId={disputeTarget}
                  sheetId={id}
                  onClose={() => setDisputeTarget(null)}
                  onFiled={handleDisputeFiled}
                />
              )}

              {/* Individual report cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {data.reports.map((r) => (
                  <ReportCard key={r.id} report={r} onDispute={handleDispute} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
