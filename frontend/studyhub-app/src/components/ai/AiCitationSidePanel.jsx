/* ═══════════════════════════════════════════════════════════════════════════
 * AiCitationSidePanel.jsx — Slide-in citation viewer.
 *
 * 480px wide, anchored right, role="dialog" aria-modal="true". Focus is
 * trapped inside the panel; Esc closes; on close focus returns to the
 * triggering footnote (handled by useFocusTrap's returnFocusOnDeactivate).
 *
 * v1 supports three source kinds: uploaded document (filename + page),
 * Scholar paper (title + venue + year), and StudyHub sheet/note (title +
 * type). Rich PDF.js / paper-card embeds land with Scholar in a later
 * week — v1 just renders the metadata + an Open CTA.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { IconX } from '../Icons'

export default function AiCitationSidePanel({ open, citation, onClose }) {
  const panelRef = useFocusTrap({ active: open, onClose, escapeCloses: true })
  if (!open || !citation) return null

  const title = citation.sourceTitle || 'Source'
  const meta = []
  if (citation.page) meta.push(`Page ${citation.page}`)
  if (citation.venue) meta.push(citation.venue)
  if (citation.year) meta.push(citation.year)

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Citation: ${title}`}
        style={{
          width: 'min(480px, 100vw)',
          height: '100vh',
          background: 'var(--sh-surface)',
          borderLeft: '1px solid var(--sh-border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--sh-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--sh-subtext)',
                marginBottom: 2,
              }}
            >
              Citation
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--sh-heading)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={title}
            >
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close citation"
            style={{
              background: 'none',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              minWidth: 36,
              minHeight: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconX size={16} style={{ color: 'var(--sh-subtext)' }} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {meta.length > 0 ? (
            <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 12 }}>
              {meta.join(' · ')}
            </div>
          ) : null}

          {citation.citedText ? (
            <blockquote
              style={{
                margin: 0,
                padding: '12px 14px',
                background: 'var(--sh-warning-bg)',
                border: '1px solid var(--sh-warning-border)',
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.55,
                color: 'var(--sh-text)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {citation.citedText}
            </blockquote>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>
              The cited passage is not available for preview.
            </p>
          )}

          {citation.openUrl ? (
            <a
              href={citation.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 16,
                background: 'var(--sh-brand)',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open source
            </a>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
