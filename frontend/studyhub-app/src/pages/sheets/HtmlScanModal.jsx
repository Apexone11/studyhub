/* ═══════════════════════════════════════════════════════════════════════════
 * HtmlScanModal.jsx — HTML security scan findings modal and tutorial overlay
 * ═══════════════════════════════════════════════════════════════════════════ */
import { FONT, tierColor, tierLabel } from './uploadSheetConstants'

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
          <div>1. Fill title, course, and description.</div>
          <div>2. Import an <strong>.html</strong> file to create original + working copies.</div>
          <div>3. Fix issues in editor while security scan runs.</div>
          <div>4. Use preview to test full-page behavior.</div>
          <div>5. Submit anytime — sheets with flagged content will be published with warnings or sent for review.</div>
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

/* ── HTML security scan modal ─────────────────────────────────────────── */
export function HtmlScanModal({
  show, scanState, scanAckChecked, setScanAckChecked,
  onClose, onAcknowledge, onUnderstood,
}) {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 85, padding: 20 }}>
      <div style={{ width: 'min(720px, 100%)', background: 'var(--sh-surface)', borderRadius: 16, border: '1px solid var(--sh-border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sh-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sh-heading)' }}>HTML Security Scan</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: tierColor(scanState.tier) }}>{tierLabel(scanState.tier)}</div>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>
            StudyHub allows rich HTML like GitHub. We scan all submissions and classify risk level. Content that violates community guidelines may lead to restrictions.
          </div>
          {scanState.findings?.length ? (
            <div style={{ border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-danger-text)', marginBottom: 6 }}>Scan Report ({scanState.findings.length} finding{scanState.findings.length !== 1 ? 's' : ''})</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--sh-danger-text)', fontSize: 12, lineHeight: 1.7 }}>
                {scanState.findings.map((finding, index) => (
                  <li key={`${index}-${finding?.message || finding}`}>{finding?.message || finding}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {scanState.tier === 1 ? (
            <div style={{ border: '1px solid var(--sh-warning-border)', background: 'var(--sh-warning-bg)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--sh-warning-text)', lineHeight: 1.6 }}>
              This sheet contains flagged HTML features (scripts, iframes, or inline handlers). It will be published with a warning banner and scripts will be disabled in the preview.
            </div>
          ) : null}

          {scanState.tier === 2 ? (
            <div style={{ border: '1px solid var(--sh-warning-border)', background: 'var(--sh-warning-bg)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--sh-warning-text)', lineHeight: 1.6 }}>
              This sheet contains high-risk behavioral patterns. It will be submitted for admin review. The preview will be disabled for other users until an admin approves it.
            </div>
          ) : null}

          {scanState.tier === 3 ? (
            <div style={{ border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--sh-danger)', lineHeight: 1.6 }}>
              This sheet has been quarantined due to a malware or phishing signature match. It cannot be published. If you believe this is an error, please contact an admin.
            </div>
          ) : null}

          {scanState.tier === 1 ? (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--sh-subtext)' }}>
              <input type="checkbox" checked={scanAckChecked} onChange={(event) => setScanAckChecked(event.target.checked)} style={{ marginTop: 2 }} />
              I understand this sheet contains flagged HTML features. It will be published with a warning badge and scripts disabled in preview. Violating community guidelines may lead to account restrictions.
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
