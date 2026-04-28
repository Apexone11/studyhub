import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { IconFork } from '../../../components/Icons'
import { FONT, panelStyle, timeAgo } from './sheetViewerConstants'
import { PURIFY_CONFIG } from '../../../components/editor/editorSanitize'
import { renderMath } from '../../../components/editor/MathExtension'
import '../../../components/editor/richTextEditor.css'

/* ── Rich text content renderer ────────────────────────────────────── */

/**
 * Renders sanitized rich text HTML produced by TipTap.
 * Uses DOMPurify with a strict allowlist — no scripts, no dangerous attributes.
 * Post-processes math nodes (data-math, data-math-display) via KaTeX.
 */
function RichTextContentBlock({ content }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Render inline math nodes
    containerRef.current.querySelectorAll('[data-math]').forEach((el) => {
      const latex = el.getAttribute('data-math')
      if (latex) el.innerHTML = renderMath(latex, false)
    })
    // Render block/display math nodes
    containerRef.current.querySelectorAll('[data-math-display]').forEach((el) => {
      const latex = el.getAttribute('data-math-display')
      if (latex) el.innerHTML = renderMath(latex, true)
    })
  }, [content])

  if (!content) {
    return (
      <div
        style={{
          padding: '24px 18px',
          textAlign: 'center',
          color: 'var(--sh-muted)',
          fontSize: 13,
        }}
      >
        No content available.
      </div>
    )
  }

  const sanitized = DOMPurify.sanitize(content, PURIFY_CONFIG)

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--sh-border)',
          background: 'var(--sh-soft)',
          fontSize: 11,
          color: 'var(--sh-muted)',
          fontWeight: 600,
        }}
      >
        <span>Rich text</span>
      </div>
      <div
        ref={containerRef}
        className="sh-richtext-viewer"
        style={{ padding: '16px 20px', minHeight: 120 }}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </div>
  )
}

/* ── Line-numbered content renderer (text content only) ─────────────── */
function TextContentBlock({ content }) {
  if (!content) {
    return (
      <div
        style={{
          padding: '24px 18px',
          textAlign: 'center',
          color: 'var(--sh-muted)',
          fontSize: 13,
        }}
      >
        No content available.
      </div>
    )
  }

  /* Security: content is rendered as textContent via React JSX — never as raw HTML.
     String.split is safe regardless of content.  No dangerouslySetInnerHTML. */
  const lines = String(content).split('\n')

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Sticky header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--sh-border)',
          background: 'var(--sh-soft)',
          fontSize: 11,
          color: 'var(--sh-muted)',
          fontWeight: 600,
        }}
      >
        <span>
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 13,
            lineHeight: 1.7,
            tableLayout: 'auto',
          }}
          role="presentation"
        >
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0 ? 'transparent' : 'var(--sh-soft)',
                }}
              >
                <td
                  style={{
                    width: 1,
                    padding: '1px 12px 1px 16px',
                    textAlign: 'right',
                    color: 'var(--sh-slate-400)',
                    fontSize: 11,
                    userSelect: 'none',
                    verticalAlign: 'top',
                    whiteSpace: 'nowrap',
                    borderRight: '1px solid var(--sh-border)',
                  }}
                  aria-hidden="true"
                >
                  {i + 1}
                </td>
                <td
                  style={{
                    padding: '1px 16px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--sh-text)',
                  }}
                >
                  {line || '\u00A0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SheetContentPanel({
  sheet,
  isHtmlSheet,
  previewMode,
  canEdit,
  canToggleInteractive,
  htmlWarningAcked,
  acceptHtmlWarning,
  safePreviewUrl,
  runtimeUrl,
  previewLoading,
  runtimeLoading,
  viewerInteractive,
  toggleViewerInteractive,
  sheetPanelRef,
}) {
  if (!sheet) return null

  return (
    <section ref={sheetPanelRef} data-tutorial="viewer-content" style={panelStyle()}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 30, color: 'var(--sh-heading)' }}>{sheet.title}</h1>
          <div style={{ marginTop: 6, color: 'var(--sh-subtext)', fontSize: 13 }}>
            by {sheet.author?.username || 'Unknown'} • {sheet.course?.code || 'General'} • updated{' '}
            {timeAgo(sheet.updatedAt || sheet.createdAt)}
          </div>
          {isHtmlSheet ? (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--sh-brand-hover)',
                  textTransform: 'uppercase',
                }}
              >
                HTML sheet
              </span>
              {sheet.status === 'rejected' ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sh-danger-text)',
                    background: 'var(--sh-danger-bg)',
                    border: '1px solid var(--sh-danger-border)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  Rejected
                </span>
              ) : sheet.status === 'quarantined' ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sh-danger-text)',
                    background: 'var(--sh-danger-bg)',
                    border: '1px solid var(--sh-danger-border)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  Quarantined
                </span>
              ) : sheet.status === 'pending_review' ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sh-warning-text)',
                    background: 'var(--sh-warning-bg)',
                    border: '1px solid var(--sh-warning-border)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  Pending Review
                </span>
              ) : previewMode === 'safe' ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sh-warning)',
                    background: 'var(--sh-warning-bg)',
                    border: '1px solid var(--sh-warning-border)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  Flagged
                </span>
              ) : null}
              {previewMode !== 'interactive' && sheet.htmlWorkflow?.riskSummary && (
                <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontWeight: 600 }}>
                  {sheet.htmlWorkflow.riskSummary}
                </span>
              )}
            </div>
          ) : null}
        </div>
        {sheet.forkSource ? (
          <div
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              color: 'var(--sh-subtext)',
              fontSize: 12,
              flexWrap: 'wrap',
            }}
          >
            <IconFork size={13} />
            Forked from{' '}
            <Link
              to={`/sheets/${sheet.forkSource.id}`}
              style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}
            >
              {sheet.forkSource.title}
            </Link>
            {sheet.forkSource.author ? (
              <span>
                by{' '}
                <Link
                  to={`/users/${sheet.forkSource.author.username}`}
                  style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}
                >
                  {sheet.forkSource.author.username}
                </Link>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {sheet.description ? (
        <p
          style={{ margin: '0 0 16px', color: 'var(--sh-subtext)', fontSize: 14, lineHeight: 1.7 }}
        >
          {sheet.description}
        </p>
      ) : null}

      {sheet.contentFormat === 'richtext' ? (
        <RichTextContentBlock content={sheet.content} />
      ) : isHtmlSheet ? (
        previewMode === 'disabled' ? (
          <div
            style={{
              borderRadius: 16,
              border: '1px solid var(--sh-danger-border)',
              background: 'var(--sh-danger-bg)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div
              style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-danger)', marginBottom: 8 }}
            >
              Quarantined
            </div>
            <div style={{ fontSize: 13, color: 'var(--sh-danger)', lineHeight: 1.6 }}>
              This sheet has been quarantined because our scanner detected a security risk. Preview
              is disabled. If you believe this is an error, contact support.
            </div>
          </div>
        ) : previewMode === 'restricted' && !canEdit ? (
          <div
            style={{
              borderRadius: 16,
              border: '1px solid var(--sh-warning-border)',
              background: 'var(--sh-warning-bg)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: 'var(--sh-warning-text)',
                marginBottom: 8,
              }}
            >
              Pending Safety Review
            </div>
            <div style={{ fontSize: 13, color: 'var(--sh-warning-text)', lineHeight: 1.6 }}>
              This sheet is awaiting admin review. The preview is disabled until it has been
              approved.
            </div>
          </div>
        ) : !htmlWarningAcked ? (
          <div
            style={{
              borderRadius: 16,
              border:
                previewMode !== 'interactive'
                  ? '1px solid var(--sh-warning-border)'
                  : '1px solid var(--sh-border)',
              background: previewMode !== 'interactive' ? 'var(--sh-warning-bg)' : 'var(--sh-soft)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color:
                  previewMode !== 'interactive' ? 'var(--sh-warning-text)' : 'var(--sh-heading)',
                marginBottom: 8,
              }}
            >
              {previewMode !== 'interactive' ? 'Flagged HTML Sheet' : 'Interactive HTML Sheet'}
            </div>
            <div
              style={{
                fontSize: 13,
                color:
                  previewMode !== 'interactive' ? 'var(--sh-warning-text)' : 'var(--sh-subtext)',
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              {previewMode !== 'interactive'
                ? 'This sheet contains flagged HTML features. Scripts are disabled in the preview. It runs in a secure sandbox with no network access.'
                : 'This sheet contains HTML with scripts. It runs in a secure sandbox with no network access, no popups, and no access to your session. Click below to load it.'}
            </div>
            <button
              type="button"
              onClick={acceptHtmlWarning}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--sh-btn-primary-bg)',
                color: 'var(--sh-btn-primary-text)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {previewMode !== 'interactive' ? 'Load safe preview' : 'Load preview'}
            </button>
          </div>
        ) : previewLoading || (viewerInteractive && runtimeLoading) ? (
          <div
            style={{
              borderRadius: 16,
              border: '1px solid var(--sh-border)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>
              Loading {viewerInteractive ? 'interactive preview' : 'safe preview'}…
            </div>
          </div>
        ) : safePreviewUrl ? (
          <div
            style={{
              borderRadius: 16,
              border: '1px solid var(--sh-border)',
              overflow: 'hidden',
              background: 'var(--sh-surface)',
            }}
          >
            {canToggleInteractive && previewMode === 'interactive' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--sh-border)',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    borderRadius: 7,
                    overflow: 'hidden',
                    border: '1px solid var(--sh-border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => viewerInteractive && toggleViewerInteractive()}
                    style={{
                      padding: '4px 12px',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: FONT,
                      background: !viewerInteractive ? 'var(--sh-brand)' : 'var(--sh-soft)',
                      color: !viewerInteractive ? '#fff' : 'var(--sh-subtext)',
                    }}
                  >
                    Safe
                  </button>
                  <button
                    type="button"
                    onClick={() => !viewerInteractive && toggleViewerInteractive()}
                    style={{
                      padding: '4px 12px',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: FONT,
                      background: viewerInteractive ? 'var(--sh-brand)' : 'var(--sh-soft)',
                      color: viewerInteractive ? '#fff' : 'var(--sh-subtext)',
                    }}
                  >
                    Interactive
                  </button>
                </div>
                <span style={{ fontSize: 10, color: 'var(--sh-muted)', lineHeight: 1.3 }}>
                  {viewerInteractive
                    ? 'Scripts enabled in a locked sandbox — no access to your account or network.'
                    : 'Scripts disabled for maximum security.'}
                </span>
              </div>
            ) : null}
            <iframe
              title={`sheet-html-${sheet.id}`}
              // Same two-mode sandbox policy as SheetHtmlPreviewPage:
              //   - Interactive runtime: allow-scripts + allow-forms ONLY
              //     (granting allow-same-origin would let author-supplied
              //     scripts read parent app cookies/storage — never).
              //   - Safe preview: allow-same-origin only (no scripts/forms).
              //     Scripts are stripped server-side, and Chrome refuses
              //     to render a cross-subdomain iframe (api.* serving the
              //     preview, www.* hosting the parent) under a fully
              //     restrictive sandbox attribute, so it shows the
              //     "(blocked:origin)" placeholder instead of content.
              // Test enforcement lives in backend/test/interactive-preview.test.js.
              sandbox={
                viewerInteractive && runtimeUrl ? 'allow-scripts allow-forms' : 'allow-same-origin'
              }
              referrerPolicy="no-referrer"
              src={viewerInteractive && runtimeUrl ? runtimeUrl : safePreviewUrl}
              style={{ width: '100%', minHeight: 560, border: 'none' }}
            />
          </div>
        ) : (
          <div
            style={{
              borderRadius: 16,
              border: '1px solid var(--sh-danger-border)',
              background: 'var(--sh-danger-bg)',
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--sh-danger)' }}>
              Could not load the sheet preview.
            </div>
          </div>
        )
      ) : (
        <TextContentBlock content={sheet.content} />
      )}
    </section>
  )
}
