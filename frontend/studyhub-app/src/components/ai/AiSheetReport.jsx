/* ═══════════════════════════════════════════════════════════════════════════
 * AiSheetReport.jsx — sheet-aware report card for the Hub AI bubble.
 *
 * Renders inside the AiBubble whenever the user is on /sheets/:id. Two
 * actions: "Analyze this sheet" (POST /api/ai/sheets/:id/analyze) and
 * "Edit with AI…" (opens an instruction prompt, calls propose-edit,
 * then opens a snapshot-naming modal before apply-edit).
 *
 * Defense in depth (CLAUDE.md A6): the "Edit with AI" buttons are
 * hidden when `canEdit` is false. The backend re-checks ownership
 * before applying — this UI hide is a UX nicety, not a security
 * control.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { IconSpark } from '../Icons'
import { API } from '../../config'
import { getStoredUser } from '../../lib/session'
import { analyzeSheet, proposeSheetEdit, applySheetEdit } from '../../lib/aiSheetService'
import { showToast } from '../../lib/toast'
import { useAiPermission } from '../../lib/aiPermissionContext'

const SEVERITY_COLOR = {
  high: 'var(--sh-danger, #ef4444)',
  medium: 'var(--sh-warning, #f59e0b)',
  low: 'var(--sh-info, #2563eb)',
}

/** Returns { sheetId } if currentPath matches /sheets/:id, else null. */
function parseSheetId(pathname) {
  if (!pathname) return null
  // Match /sheets/123 but NOT /sheets/new, /sheets/upload, /sheets/preview/...
  const m = pathname.match(/^\/sheets\/(\d+)(?:\/.*)?$/)
  if (!m) return null
  return { sheetId: Number(m[1]) }
}

/**
 * AiSheetReport — entry card. Self-contained so the bubble can drop it
 * in conditionally without leaking state when the user navigates away.
 *
 * Props:
 *   onClose:  callback when the user closes the report (back to chat).
 *
 * State-reset on sheet change is handled by remounting the inner
 * component via a `key` derived from sheetId — avoids the
 * setState-in-effect anti-pattern the React Compiler flags.
 */
export default function AiSheetReport({ onClose }) {
  const location = useLocation()
  const sheetContext = useMemo(() => parseSheetId(location.pathname), [location.pathname])
  if (!sheetContext) return null
  return (
    <AiSheetReportInner
      key={sheetContext.sheetId}
      sheetId={sheetContext.sheetId}
      onClose={onClose}
    />
  )
}

function AiSheetReportInner({ sheetId, onClose }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [canEdit, setCanEdit] = useState(false)

  const [editPanelOpen, setEditPanelOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState(null)
  const [proposing, setProposing] = useState(false)

  const [snapshotName, setSnapshotName] = useState('')
  const [snapshotMessage] = useState('')
  const [applying, setApplying] = useState(false)

  // Detect ownership for the optional "Edit with AI" buttons.
  // The backend re-checks ownership before applying (CLAUDE.md A6) so
  // this is purely a UX nicety, not a security control.
  useEffect(() => {
    const me = getStoredUser()
    if (!me) return
    const ac = new AbortController()
    fetch(`${API}/api/sheets/${sheetId}`, { credentials: 'include', signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((sheet) => {
        if (!sheet) return
        const ownerId = sheet?.sheet?.userId ?? sheet?.userId
        if (me.role === 'admin' || ownerId === me.id) setCanEdit(true)
      })
      .catch(() => {
        /* graceful — buttons stay hidden */
      })
    return () => ac.abort()
  }, [sheetId])

  const sheetContext = { sheetId }
  const { requestPermission } = useAiPermission()

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    const res = await analyzeSheet(sheetContext.sheetId)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReport(res.data)
  }

  const handlePropose = async () => {
    if (!instruction.trim()) return
    setProposing(true)
    setError(null)
    const res = await proposeSheetEdit(sheetContext.sheetId, instruction.trim())
    setProposing(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setProposal(res.data)
  }

  const handleApply = async () => {
    if (!proposal?.proposedContent) return

    // CLAUDE-CODE-STYLE PERMISSION GATE.
    // Snapshot + write only happen after the user explicitly accepts
    // the dialog. If they reject, NOTHING persists — the proposal
    // stays in memory for them to modify or discard.
    const fallbackName = snapshotName.trim() || instruction.trim().slice(0, 60) || 'AI edit'
    const accepted = await requestPermission({
      kind: 'sheet.edit',
      title: 'Apply AI edit to this sheet?',
      summary:
        'Hub AI wants to replace the current sheet content with its proposal. A snapshot of the existing content will be saved first so you can revert from History anytime.',
      preview: (
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            fontSize: 11.5,
            color: 'var(--sh-text)',
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {proposal.proposedContent.slice(0, 1200)}
          {proposal.proposedContent.length > 1200 ? '\n…' : ''}
        </pre>
      ),
      applyLabel: 'Apply edit',
      rejectLabel: 'Discard',
      details: {
        snapshotName: fallbackName,
        newLength: proposal.diffSummary?.newLength ?? proposal.proposedContent.length,
        delta: proposal.diffSummary?.delta ?? 0,
      },
    })

    if (!accepted) {
      showToast('AI edit discarded. No changes were made.', 'info')
      return
    }

    setApplying(true)
    setError(null)
    const res = await applySheetEdit(sheetContext.sheetId, {
      proposedContent: proposal.proposedContent,
      snapshotName: fallbackName,
      snapshotMessage: snapshotMessage.trim() || undefined,
    })
    setApplying(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const msg = res.data?.quarantined
      ? 'AI edit submitted for review (Tier-3 content). Snapshot saved.'
      : 'AI edit applied. Snapshot saved in History.'
    showToast(msg, res.data?.quarantined ? 'warning' : 'success')
    setEditPanelOpen(false)
    setProposal(null)
    setInstruction('')
    setSnapshotName('')
    // Trigger a soft refresh of the sheet — the SheetLab page listens
    // for this custom event.
    window.dispatchEvent(
      new CustomEvent('sh:sheet-updated', { detail: { sheetId: sheetContext.sheetId } }),
    )
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      style={{
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        background: 'var(--sh-soft)',
        padding: 12,
        marginBottom: 12,
        fontSize: 12.5,
        color: 'var(--sh-text)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconSpark size={14} style={{ color: 'var(--sh-brand)' }} />
          <strong style={{ fontSize: 12.5, color: 'var(--sh-heading)' }}>
            Hub AI · this sheet
          </strong>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sheet report"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--sh-muted)',
              fontSize: 11,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            Hide
          </button>
        ) : null}
      </header>

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          style={primaryActionStyle(loading)}
        >
          {loading ? 'Analyzing…' : report ? 'Re-analyze' : 'Analyze sheet'}
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditPanelOpen((v) => !v)}
            style={secondaryActionStyle()}
          >
            {editPanelOpen ? 'Hide edit' : 'Edit with AI…'}
          </button>
        ) : null}
      </div>

      {/* Error */}
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {/* Report findings */}
      {report ? (
        <ReportSummary report={report} />
      ) : !loading ? (
        <p style={{ margin: 0, color: 'var(--sh-muted)', fontSize: 11.5 }}>
          {canEdit
            ? 'Run a quick analysis or describe an edit you want AI to draft.'
            : 'Get an AI report on this sheet (read-only for non-owners).'}
        </p>
      ) : null}

      {/* Edit panel */}
      {editPanelOpen && canEdit ? (
        <EditPanel
          instruction={instruction}
          setInstruction={setInstruction}
          proposing={proposing}
          proposal={proposal}
          onPropose={handlePropose}
          onApplyClick={() => {
            // Default the snapshot name from the instruction; the
            // permission dialog renders it in the details panel and
            // the user sees it before accepting.
            setSnapshotName(instruction.slice(0, 60))
            handleApply()
          }}
          applying={applying}
          onDiscard={() => {
            setProposal(null)
            setInstruction('')
          }}
        />
      ) : null}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────

function ReportSummary({ report }) {
  const totalFindings = (report.issues?.length || 0) + (report.suggestions?.length || 0)
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {report.summary ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-text)', lineHeight: 1.5 }}>
          {report.summary}
        </p>
      ) : null}
      {totalFindings === 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--sh-muted)' }}>
          No issues found. Nice sheet.
        </p>
      ) : null}
      {report.issues?.length ? (
        <details open style={{ fontSize: 11.5 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--sh-heading)', fontWeight: 600 }}>
            Issues ({report.issues.length})
          </summary>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, display: 'grid', gap: 4 }}>
            {report.issues.map((issue, i) => (
              <li key={i} style={{ lineHeight: 1.4 }}>
                <span
                  aria-label={`severity ${issue.severity}`}
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: SEVERITY_COLOR[issue.severity] || SEVERITY_COLOR.low,
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }}
                />
                <strong style={{ color: 'var(--sh-heading)' }}>{issue.title}</strong>
                {issue.suggestion ? (
                  <span style={{ color: 'var(--sh-text)' }}>{' — ' + issue.suggestion}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.suggestions?.length ? (
        <details style={{ fontSize: 11.5 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--sh-heading)', fontWeight: 600 }}>
            Suggestions ({report.suggestions.length})
          </summary>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, display: 'grid', gap: 4 }}>
            {report.suggestions.map((s, i) => (
              <li key={i} style={{ lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--sh-heading)' }}>{s.title}</strong>
                {s.why ? <span style={{ color: 'var(--sh-text)' }}>{' — ' + s.why}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function EditPanel({
  instruction,
  setInstruction,
  proposing,
  proposal,
  onPropose,
  onApplyClick,
  applying = false,
  onDiscard,
}) {
  return (
    <div
      style={{
        marginTop: 10,
        borderTop: '1px solid var(--sh-border)',
        paddingTop: 10,
        display: 'grid',
        gap: 8,
      }}
    >
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--sh-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}
      >
        Describe the edit
      </label>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder="e.g. Tighten the conclusion. Fix any typos."
        style={{
          width: '100%',
          padding: 8,
          fontSize: 12,
          borderRadius: 8,
          border: '1px solid var(--sh-border)',
          background: 'var(--sh-bg)',
          color: 'var(--sh-text)',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onPropose}
          disabled={proposing || !instruction.trim()}
          style={primaryActionStyle(proposing || !instruction.trim())}
        >
          {proposing ? 'Drafting…' : 'Draft edit'}
        </button>
        {proposal ? (
          <>
            <button
              type="button"
              onClick={onApplyClick}
              disabled={applying}
              style={primaryActionStyle(applying)}
            >
              {applying ? 'Applying…' : 'Apply edit…'}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={applying}
              style={secondaryActionStyle()}
            >
              Discard draft
            </button>
          </>
        ) : null}
      </div>
      {proposal ? (
        <div
          style={{
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            background: 'var(--sh-surface)',
            padding: 8,
            fontSize: 11,
            color: 'var(--sh-muted)',
          }}
        >
          <div style={{ marginBottom: 4, color: 'var(--sh-heading)', fontWeight: 600 }}>
            Draft ready
          </div>
          <div>
            New size: {proposal.diffSummary?.newLength} chars (
            {proposal.diffSummary?.delta >= 0 ? '+' : ''}
            {proposal.diffSummary?.delta} vs current). Reviewable in the Editor tab after Apply.
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ErrorBanner({ message, onDismiss }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--sh-danger-bg)',
        color: 'var(--sh-danger-text)',
        border: '1px solid var(--sh-danger-border, var(--sh-border))',
        borderRadius: 8,
        padding: '6px 8px',
        marginBottom: 8,
        fontSize: 11.5,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 11,
          padding: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────

function primaryActionStyle(disabled) {
  return {
    background: disabled ? 'var(--sh-soft)' : 'var(--sh-brand)',
    color: disabled ? 'var(--sh-muted)' : '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function secondaryActionStyle() {
  return {
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    border: '1px solid var(--sh-border)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
  }
}
