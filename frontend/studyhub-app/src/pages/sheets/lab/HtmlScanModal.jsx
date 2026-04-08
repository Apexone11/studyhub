/* ═══════════════════════════════════════════════════════════════════════════
 * HtmlScanModal.jsx — HTML security scan findings modal and tutorial overlay
 * ═══════════════════════════════════════════════════════════════════════════ */
import { FONT, tierColor, tierLabel } from '../upload/uploadSheetConstants'

/* ── Tutorial welcome modal ───────────────────────────────────────────── */
export function TutorialModal({ show, onDismiss }) {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 20 }}>
      <div style={{ width: 'min(680px, 100%)', background: 'var(--sh-surface)', borderRadius: 18, border: '1px solid var(--sh-border)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', color: '#fff' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>HTML Upload</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>Upload, scan, and preview your HTML study sheets.</div>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 10, fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.7 }}>
          <div>1. Fill in a title, course, and description.</div>
          <div>2. Import an <strong>.html</strong> file — we create a safe working copy automatically.</div>
          <div>3. Edit freely while our security scan runs in the background.</div>
          <div>4. Use the preview to check how your sheet will look.</div>
          <div>5. Submit when ready — most sheets publish instantly. If anything is flagged, you will see exactly what was found and what happens next.</div>
        </div>
        <div style={{ borderTop: '1px solid var(--sh-border)', padding: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onDismiss} style={{ background: 'var(--sh-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

const SEVERITY_COLORS = {
  critical: 'var(--sh-danger)',
  high: 'var(--sh-danger)',
  medium: 'var(--sh-warning)',
}

/* ── Grouped findings by category ────────────────────────────────────── */
function GroupedFindings({ findingsByCategory, findings }) {
  const groups = findingsByCategory && Object.keys(findingsByCategory).length > 0
    ? findingsByCategory
    : null

  if (groups) {
    const entries = Object.entries(groups).sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 }
      return (order[a[1].maxSeverity] ?? 3) - (order[b[1].maxSeverity] ?? 3)
    })
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map(([category, group]) => (
          <div key={category} style={{ border: `1px solid ${SEVERITY_COLORS[group.maxSeverity] || 'var(--sh-border)'}20`, background: `${SEVERITY_COLORS[group.maxSeverity] || 'var(--sh-border)'}08`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: SEVERITY_COLORS[group.maxSeverity] || 'var(--sh-muted)' }}>
                {group.maxSeverity}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-heading)' }}>
                {group.label}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.7 }}>
              {group.findings.map((f, i) => (
                <li key={i}>{f.message || String(f)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )
  }

  // Fallback: flat list for legacy data without categories
  if (!findings?.length) return null
  return (
    <div style={{ border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-danger-text)', marginBottom: 6 }}>Scan Report ({findings.length} finding{findings.length !== 1 ? 's' : ''})</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--sh-danger-text)', fontSize: 12, lineHeight: 1.7 }}>
        {findings.map((finding, index) => (
          <li key={`${index}-${finding?.message || finding}`}>{finding?.message || finding}</li>
        ))}
      </ul>
    </div>
  )
}

/* ── HTML security scan modal ─────────────────────────────────────────── */
export function HtmlScanModal({
  show, scanState, scanAckChecked, setScanAckChecked,
  onClose, onAcknowledge, onUnderstood,
}) {
  if (!show) return null

  const tierExplanation = scanState.tierExplanation || ''
  const riskSummary = scanState.riskSummary || ''

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 85, padding: 20 }}>
      <div style={{ width: 'min(720px, 100%)', background: 'var(--sh-surface)', borderRadius: 16, border: '1px solid var(--sh-border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sh-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sh-heading)' }}>HTML Security Scan</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: tierColor(scanState.tier) }}>{tierLabel(scanState.tier)}</div>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10, maxHeight: '60vh', overflow: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
            StudyHub supports rich HTML study sheets. Every submission is automatically scanned to keep the platform safe for everyone. Most sheets pass without issues. Below is what the scanner found in yours.
          </div>

          {/* Risk summary */}
          {riskSummary && scanState.tier >= 1 ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: tierColor(scanState.tier) }}>
              {riskSummary}
            </div>
          ) : null}

          {/* Grouped findings */}
          <GroupedFindings findingsByCategory={scanState.findingsByCategory} findings={scanState.findings} />

          {/* Tier explanation */}
          {tierExplanation && scanState.tier >= 1 ? (
            <div style={{
              border: `1px solid ${scanState.tier >= 3 ? 'var(--sh-danger-border)' : 'var(--sh-warning-border)'}`,
              background: scanState.tier >= 3 ? 'var(--sh-danger-bg)' : 'var(--sh-warning-bg)',
              borderRadius: 10, padding: 12, fontSize: 12,
              color: scanState.tier >= 3 ? 'var(--sh-danger)' : 'var(--sh-warning-text)',
              lineHeight: 1.6,
            }}>
              {tierExplanation}
            </div>
          ) : null}

          {scanState.tier === 1 ? (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--sh-subtext)' }}>
              <input type="checkbox" checked={scanAckChecked} onChange={(event) => setScanAckChecked(event.target.checked)} style={{ marginTop: 2 }} />
              I understand this sheet has flagged features. It will be published with a small warning badge visible to viewers. Scripts are disabled in preview for safety.
            </label>
          ) : null}
        </div>
        <div style={{ borderTop: '1px solid var(--sh-border)', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'var(--sh-surface)', color: 'var(--sh-muted)', border: '1px solid var(--sh-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontFamily: FONT }}
          >
            {scanState.tier >= 2 ? 'Close' : 'Keep open'}
          </button>
          {scanState.tier === 1 ? (
            <button
              type="button"
              disabled={!scanAckChecked}
              onClick={onAcknowledge}
              style={{ background: scanAckChecked ? 'var(--sh-brand)' : 'var(--sh-slate-300)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: scanAckChecked ? 'pointer' : 'not-allowed', fontFamily: FONT }}
            >
              Acknowledge and dismiss
            </button>
          ) : scanState.tier === 2 ? (
            <button
              type="button"
              onClick={onUnderstood}
              style={{ background: 'var(--sh-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
            >
              Understood
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
